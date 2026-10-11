// tests/tools-unavailable.test.ts
// Phase 0 驗收：SearchOutcome → LLM 字串映射，與 DB 圖譜下兩個查詢工具的守衛。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installLogseqMock, LogseqMock } from './helpers/logseq-mock';
import { resetGraphKind } from '../src/graph/kind';

const ragState = vi.hoisted(() => ({ outcome: null as any, linkedRefsCalls: 0 }));

vi.mock('../src/rag', () => ({
    searchSimilarBlocks: vi.fn(async () => ragState.outcome),
    getLinkedReferencesForPage: vi.fn(async () => {
        ragState.linkedRefsCalls++;
        return 'REFS';
    }),
    syncVectorDB: vi.fn(),
    fetchLogseqBlocks: vi.fn(),
    getIndexState: vi.fn(),
}));

import { executeToolCall } from '../src/tools';

let mock: LogseqMock;

beforeEach(() => {
    mock = installLogseqMock();
    resetGraphKind();
    ragState.linkedRefsCalls = 0;
});

async function asDbGraph() {
    mock.App.getInfo = vi.fn(async () => ({ version: '0.11.0', supportDb: true }));
    mock.App.checkCurrentIsDbGraph = vi.fn(async () => true);
    resetGraphKind();
}

describe('semantic_search：SearchOutcome → LLM 字串', () => {
    it('unavailable/building → INDEX_UNAVAILABLE，results 為 null 且絕不是 []', async () => {
        ragState.outcome = { status: 'unavailable', reason: 'building' };
        const out = await executeToolCall('semantic_search', { query: 'x' });
        expect(out).toContain('"status":"INDEX_UNAVAILABLE"');
        expect(out).toContain('"reason":"building"');
        expect(out).toContain('"results":null');
        expect(out).not.toContain('"results":[]');
        expect(out).toContain('NOT evidence');
    });

    it.each(['idle', 'failed', 'search-error'])('unavailable/%s 同形', async (reason) => {
        ragState.outcome = { status: 'unavailable', reason };
        const out = await executeToolCall('semantic_search', { query: 'x' });
        expect(out).toContain('"status":"INDEX_UNAVAILABLE"');
        expect(out).toContain(`"reason":"${reason}"`);
        expect(out).toContain('"results":null');
    });

    it('unavailable/unsupported → GRAPH_TYPE_UNSUPPORTED', async () => {
        ragState.outcome = { status: 'unavailable', reason: 'unsupported' };
        const out = await executeToolCall('semantic_search', { query: 'x' });
        expect(out).toContain('"status":"GRAPH_TYPE_UNSUPPORTED"');
        expect(out).toContain('"results":null');
        expect(out).not.toContain('"results":[]');
    });

    it('unavailable/empty-graph → GRAPH_HAS_NO_INDEXABLE_BLOCKS（合法狀態）', async () => {
        ragState.outcome = { status: 'unavailable', reason: 'empty-graph' };
        const out = await executeToolCall('semantic_search', { query: 'x' });
        expect(out).toContain('"status":"GRAPH_HAS_NO_INDEXABLE_BLOCKS"');
        expect(out).toContain('"results":[]');
    });

    it('ok 但 0 筆 → NO_MATCH_ABOVE_THRESHOLD 並附閾值與反過度推論說明', async () => {
        ragState.outcome = { status: 'ok', hits: [] };
        const out = await executeToolCall('semantic_search', { query: 'x' });
        expect(out).toContain('"status":"NO_MATCH_ABOVE_THRESHOLD"');
        expect(out).toContain('"similarity_threshold":0.3');
        expect(out).toContain('does not prove');
    });

    it('ok 有結果 → OK + results', async () => {
        ragState.outcome = { status: 'ok', hits: [{ id: 'a', content: 'c' }] };
        const out = await executeToolCall('semantic_search', { query: 'x' });
        expect(out).toContain('"status":"OK"');
        expect(JSON.parse(out).results).toEqual([{ id: 'a', content: 'c' }]);
    });
});

describe('DB 圖譜守衛（杜絕靜默空結果）', () => {
    it('graph_tag_search 在 db → GRAPH_TYPE_UNSUPPORTED，不跑舊查詢', async () => {
        await asDbGraph();
        mock.DB.datascriptQuery = vi.fn(async () => { throw new Error('must not run'); });
        const out = await executeToolCall('graph_tag_search', { target_page: 'Apple' });
        expect(out).toContain('"status":"GRAPH_TYPE_UNSUPPORTED"');
        expect(out).toContain('"results":null');
        expect(out).not.toContain('No results found');
        expect(ragState.linkedRefsCalls).toBe(0);
    });

    it('global_keyword_search 在 db → GRAPH_TYPE_UNSUPPORTED，不是 "No results found"', async () => {
        await asDbGraph();
        mock.DB.datascriptQuery = vi.fn(async () => { throw new Error('must not run'); });
        const out = await executeToolCall('global_keyword_search', { keyword: 'x' });
        expect(out).toContain('"status":"GRAPH_TYPE_UNSUPPORTED"');
        expect(out).not.toContain('No results found');
        expect(mock.DB.datascriptQuery).not.toHaveBeenCalled();
    });

    it('file 圖譜（預設 mock）→ graph_tag_search 仍委派 rag', async () => {
        const out = await executeToolCall('graph_tag_search', { target_page: 'Apple' });
        expect(out).toContain('REFS');
        expect(ragState.linkedRefsCalls).toBe(1);
    });

    it('file 圖譜 → global_keyword_search 零結果仍回舊文案（Phase 0 不改 file 行為）', async () => {
        mock.DB.datascriptQuery = vi.fn(async () => []);
        const out = await executeToolCall('global_keyword_search', { keyword: 'zzz' });
        expect(out).toContain('No results found for keyword');
    });
});
