// tests/file-graph-snapshot.test.ts
// Phase 0 結束時錄製的 file-graph 輸出基準快照。
// Phase 1 的 FileGraphAdapter 必須逐字比對通過（plan §4.2）。
// 輸入皆為固定語料，輸出不得含時間戳或非確定性內容。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installLogseqMock, LogseqMock } from './helpers/logseq-mock';

const FETCH_ROWS = [
    {
        uuid: 'aaaa-1',
        content: 'first block about Apple\nsecond line',
        page: { 'original-name': 'Alpha', name: 'alpha' },
    },
    {
        uuid: 'aaaa-2',
        content: '無頁名測試',
        page: {},
    },
    {
        uuid: 'aaaa-3',
        content: 'contains "quotes" & <angles>',
        page: { 'original-name': 'Beta Gamma', name: 'beta gamma' },
    },
];

const REF_ROWS = [
    { content: 'refers to [[Apple]] from body', page: { 'original-name': 'Alpha' } },
    { content: 'another ref', page: { 'original-name': 'Beta Gamma' } },
];

const KEYWORD_ROWS = [
    { uuid: 'aaaa-1', content: 'first block about Apple\nsecond line', page: { id: 'p1' } },
    { uuid: 'aaaa-3', content: 'contains "quotes" & <angles>', page: { id: 'p2' } },
];

const OUTLINE_TREE = [
    {
        uuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        content: 'Chapter One\nmore',
        children: [{ uuid: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', content: 'nested text', children: [] }],
    },
    { uuid: 'cccccccc-cccc-cccc-cccc-cccccccccccc', content: 'Chapter Two', children: [] },
];

function routingFake(mock: LogseqMock) {
    return vi.fn(async (query: string) => {
        if (query.includes('(count')) return 3;
        if (query.includes(':block/refs')) return REF_ROWS.map((r) => [r]);
        if (query.includes('clojure.string/includes?')) return KEYWORD_ROWS.map((r) => [r]);
        if (query.includes(':block/content')) return FETCH_ROWS.map((r) => [r]);
        return [];
    });
}

let mock: LogseqMock;

beforeEach(() => {
    mock = installLogseqMock();
    mock.DB.datascriptQuery = routingFake(mock);
    mock.Editor.getPage = vi.fn(async (id: string) =>
        id === 'p1' ? { name: 'alpha' } : id === 'p2' ? { name: 'beta gamma' } : null
    );
    mock.Editor.getPageBlocksTree = vi.fn(async () => OUTLINE_TREE);
    mock.Editor.getBlock = vi.fn(async (uuid: string) =>
        uuid === 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' ? OUTLINE_TREE[0] : null
    );
});

describe('file-graph 輸出快照（Phase 1 逐字比對基準）', () => {
    it('五個呼叫點的輸出與 v0.10.1 一致', async () => {
        vi.resetModules();
        const rag = await import('../src/rag');
        const tools = await import('../src/tools');

        const fetched = await rag.fetchLogseqBlocks();
        const linkedRefs = await rag.getLinkedReferencesForPage('Apple');
        const keyword = await tools.executeToolCall('global_keyword_search', { keyword: 'Apple' });
        const outline = await tools.executeToolCall('get_page_outline', { page_name: 'Alpha' });
        const block = await tools.executeToolCall('read_target_block', { uuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' });

        await expect({
            fetchLogseqBlocks: fetched,
            getLinkedReferencesForPage: linkedRefs,
            global_keyword_search: keyword,
            get_page_outline: outline,
            read_target_block: block,
        }).toMatchFileSnapshot('./__snapshots__/file-graph-output.json');
    });
});
