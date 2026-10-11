// tests/graph-file.test.ts
// FileGraphAdapter 單元測試：補快照未涵蓋的邊界（映射、slice、fallback、canary 分支）。
// 五個呼叫點的輸出逐字基準在 tests/file-graph-snapshot.test.ts。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installLogseqMock, LogseqMock } from './helpers/logseq-mock';
import { createSchemaAwareFake, fileBlockRow } from './helpers/graph-fake';
import { FileGraphAdapter } from '../src/graph/file';

let mock: LogseqMock;
let adapter: FileGraphAdapter;

function firstQuery(): string {
    return String((mock.DB.datascriptQuery as any).mock.calls[0][0]);
}

beforeEach(() => {
    mock = installLogseqMock();
    adapter = new FileGraphAdapter();
});

describe('FileGraphAdapter.fetchAllBlocks', () => {
    it('有列 → ok；映射逐字（original-name 優先、name 二備、無頁 → 未命名頁面）', async () => {
        const rows = [
            fileBlockRow('f-1', 'content one', 'Alpha'),
            { uuid: 'f-2', content: 'content two', page: { name: 'lower only' } },
            { uuid: 'f-3', content: 'no page' },
        ];
        mock.DB.datascriptQuery = createSchemaAwareFake({ kind: 'file', fileRows: rows, pageCount: 3 });
        const out = await adapter.fetchAllBlocks();
        expect(out).toEqual({
            status: 'ok',
            kind: 'file',
            blocks: [
                { id: 'f-1', content: 'content one', pageName: 'Alpha' },
                { id: 'f-2', content: 'content two', pageName: 'lower only' },
                { id: 'f-3', content: 'no page', pageName: '未命名頁面' },
            ],
        });
        expect(mock.DB.datascriptQuery).toHaveBeenCalledTimes(1); // 有列不跑 canary
    });

    it('零列 + canary 0 → empty；canary 21 → unsupported/schema-mismatch', async () => {
        mock.DB.datascriptQuery = createSchemaAwareFake({ kind: 'file', fileRows: [], pageCount: 0 });
        expect(await adapter.fetchAllBlocks()).toEqual({ status: 'empty', kind: 'file' });

        mock.DB.datascriptQuery = createSchemaAwareFake({ kind: 'file', fileRows: [], pageCount: 21 });
        expect(await adapter.fetchAllBlocks()).toEqual({
            status: 'unsupported', kind: 'file', reason: 'schema-mismatch', detail: 'canary=21',
        });
    });

    it('查詢拋錯逃出（adapter 不 catch，落入 syncVectorDB 外層 catch）', async () => {
        mock.DB.datascriptQuery = vi.fn(async () => { throw new Error('ds-boom'); });
        await expect(adapter.fetchAllBlocks()).rejects.toThrow('ds-boom');
    });
});

describe('FileGraphAdapter.blocksReferencingPage', () => {
    it('slug 小寫去 # 後插值；映射 text/fromPage 逐字，缺頁名回退「未知頁面」', async () => {
        const rows = [
            { content: 'ref one', page: { 'original-name': 'Alpha' } },
            { content: 'ref two' },
        ];
        mock.DB.datascriptQuery = vi.fn(async () => rows.map((r) => [r]));
        const hits = await adapter.blocksReferencingPage('#Apple');
        expect(hits).toEqual([
            { text: 'ref one', fromPage: 'Alpha' },
            { text: 'ref two', fromPage: '未知頁面' },
        ]);
        const q = firstQuery();
        expect(q).toContain('[?p :block/name "apple"]');
        expect(q).toContain('[?b :block/refs ?p]');
        expect(q).not.toContain('not='); // 逐字：file 版無自我引用過濾
    });
});

describe('FileGraphAdapter.keywordSearch', () => {
    it('slice(limit) 先於 N+1 getPage；頁名取 page.name（非 originalName）；缺頁 → Unknown Page', async () => {
        const rows = Array.from({ length: 12 }, (_, i) => ({
            uuid: `k-${i}`,
            content: `kw block ${i}`,
            page: { id: i < 10 ? `p-${i}` : 'p-missing' },
        }));
        mock.DB.datascriptQuery = vi.fn(async () => rows.map((r) => [r]));
        mock.Editor.getPage = vi.fn(async (id: string) => (id === 'p-missing' ? null : { name: `Name-${id}` }));
        const hits = await adapter.keywordSearch('kw', 10);
        expect(hits).toHaveLength(10);
        expect(hits[0]).toEqual({ uuid: 'k-0', pageTitle: 'Name-p-0', text: 'kw block 0' });
        expect(hits[9]).toEqual({ uuid: 'k-9', pageTitle: 'Name-p-9', text: 'kw block 9' });
        expect(mock.Editor.getPage).toHaveBeenCalledTimes(10);
    });

    it('缺頁回退 Unknown Page；零列 → []', async () => {
        mock.DB.datascriptQuery = vi.fn(async () => [
            [{ uuid: 'k-1', content: 'kw x', page: { id: 'ghost' } }],
        ]);
        mock.Editor.getPage = vi.fn(async () => null);
        expect(await adapter.keywordSearch('kw', 10)).toEqual([
            { uuid: 'k-1', pageTitle: 'Unknown Page', text: 'kw x' },
        ]);

        mock.DB.datascriptQuery = vi.fn(async () => []);
        expect(await adapter.keywordSearch('zzz', 10)).toEqual([]);
    });

    it('關鍵字跳脫與現行插值通道一致', async () => {
        mock.DB.datascriptQuery = vi.fn(async () => []);
        await adapter.keywordSearch('a"b\\c', 10);
        expect(firstQuery()).toContain('a\\"b\\\\c');
    });
});

describe('FileGraphAdapter.pageTree / blockTree', () => {
    const TREE = [
        { uuid: 'n-1', content: 'top one', children: [{ uuid: 'n-1-1', content: 'child', children: [] }] },
        { uuid: 'n-2', content: 'top two' },
    ];

    it('pageTree 遞迴映射 BlockNode；children 缺席 → []', async () => {
        mock.Editor.getPageBlocksTree = vi.fn(async () => TREE);
        expect(await adapter.pageTree('Alpha')).toEqual([
            { uuid: 'n-1', text: 'top one', children: [{ uuid: 'n-1-1', text: 'child', children: [] }] },
            { uuid: 'n-2', text: 'top two', children: [] },
        ]);
    });

    it('pageTree：getPageBlocksTree 回 nil → null；回 [] → []', async () => {
        mock.Editor.getPageBlocksTree = vi.fn(async () => null);
        expect(await adapter.pageTree('Ghost')).toBeNull();
        mock.Editor.getPageBlocksTree = vi.fn(async () => []);
        expect(await adapter.pageTree('Empty')).toEqual([]);
    });

    it('blockTree 以 includeChildren:true 呼叫並映射；找不到 → null', async () => {
        mock.Editor.getBlock = vi.fn(async () => TREE[0]);
        expect(await adapter.blockTree('n-1')).toEqual({
            uuid: 'n-1', text: 'top one', children: [{ uuid: 'n-1-1', text: 'child', children: [] }],
        });
        expect(mock.Editor.getBlock).toHaveBeenCalledWith('n-1', { includeChildren: true });

        mock.Editor.getBlock = vi.fn(async () => null);
        expect(await adapter.blockTree('gone')).toBeNull();
    });
});
