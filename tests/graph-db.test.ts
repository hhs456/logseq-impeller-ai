// tests/graph-db.test.ts
// DbGraphAdapter（fake）驗收：datalog 字串契約與欄位映射（計畫 §4.9）。
// 本檔是 tests/helpers/graph-fake.ts dbBlockRow() 的第一個消費者。
// 注意：斷言只驗「字串契約與映射」，不宣稱 datalog 語意正確——語意全憑夜版 N9–N13。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installLogseqMock, LogseqMock } from './helpers/logseq-mock';
import { createSchemaAwareFake, dbBlockRow } from './helpers/graph-fake';
import { DbGraphAdapter } from '../src/graph/db';

let mock: LogseqMock;
let adapter: DbGraphAdapter;

function queries(): string[] {
    return (mock.DB.datascriptQuery as any).mock.calls.map((c: any[]) => String(c[0]));
}

beforeEach(() => {
    mock = installLogseqMock();
    adapter = new DbGraphAdapter();
});

describe('DB datalog 字串契約（§4.9：含 :block/title、不含 :block/content）', () => {
    it('三個 datalog 表面全部通過屬性檢查', async () => {
        mock.DB.datascriptQuery = createSchemaAwareFake({
            kind: 'db',
            dbRows: [dbBlockRow('d-1', 'raw', 'Readable', 'Page T')],
            pageCount: 1,
        });
        await adapter.fetchAllBlocks();
        await adapter.blocksReferencingPage('Apple');
        await adapter.keywordSearch('kw', 10);
        const qs = queries();
        expect(qs).toHaveLength(3);
        for (const q of qs) {
            expect(q).toContain(':block/title');
            expect(q).not.toContain(':block/content');
        }
    });

    it('fetch 查詢：pull refs（供 [[uuid]] 解析）＋以 :block/page 排除頁/entity＋空字串過濾', async () => {
        mock.DB.datascriptQuery = createSchemaAwareFake({ kind: 'db', dbRows: [], pageCount: 0 });
        await adapter.fetchAllBlocks();
        const q = queries()[0];
        expect(q).toContain('{:block/refs [:block/uuid :block/title]}');
        expect(q).toContain('{:block/page [:block/title]}');
        expect(q).toContain('[?b :block/page ?p]');
        expect(q).toContain('[(not= ?c "")]');
    });

    it('refs 查詢：(or refs tags) ＋ not= 自我引用 ＋ 小寫 name 插值（決策 #5：不用 :in）', async () => {
        mock.DB.datascriptQuery = createSchemaAwareFake({ kind: 'db', dbRows: [], pageCount: 0 });
        await adapter.blocksReferencingPage('#Apple');
        const q = queries()[0];
        expect(q).toContain('(or [?b :block/refs ?p] [?b :block/tags ?p])');
        expect(q).toContain('[(not= ?b ?p)]');
        expect(q).toContain('[?p :block/name "apple"]');
        expect(q).not.toContain(' :in ');
    });

    it('keyword 查詢：raw title includes? ＋ 頁名走 pull（無 N+1 Editor.getPage）', async () => {
        mock.DB.datascriptQuery = createSchemaAwareFake({ kind: 'db', dbRows: [], pageCount: 0 });
        await adapter.keywordSearch('kw', 10);
        const q = queries()[0];
        expect(q).toContain('[(clojure.string/includes? ?c "kw")]');
        expect(q).toContain('{:block/page [:block/title]}');
        expect(mock.Editor.getPage).not.toHaveBeenCalled();
    });
});

describe('DbGraphAdapter 欄位映射', () => {
    it('fetchAllBlocks：full-title 優先 title；缺 page → 未命名頁面', async () => {
        const rows = [
            dbBlockRow('d-1', 'raw [[uuid]]', 'Readable Title', 'Page T'),
            { uuid: 'd-2', title: 'no full-title row', page: { title: 'Inner' } },
            { uuid: 'd-3', 'full-title': 'orphan text', title: 't3' },
        ];
        mock.DB.datascriptQuery = vi.fn(async () => rows.map((r) => [r]));
        expect(await adapter.fetchAllBlocks()).toEqual({
            status: 'ok',
            kind: 'db',
            blocks: [
                { id: 'd-1', content: 'Readable Title', pageName: 'Page T' },
                { id: 'd-2', content: 'no full-title row', pageName: 'Inner' },
                { id: 'd-3', content: 'orphan text', pageName: '未命名頁面' },
            ],
        });
    });

    it('fetchAllBlocks 零列：canary 鏡像 file 版（21 → schema-mismatch；0 → empty）（決策 #3）', async () => {
        mock.DB.datascriptQuery = createSchemaAwareFake({ kind: 'db', dbRows: [], pageCount: 21 });
        expect(await adapter.fetchAllBlocks()).toEqual({
            status: 'unsupported', kind: 'db', reason: 'schema-mismatch', detail: 'canary=21',
        });

        mock.DB.datascriptQuery = createSchemaAwareFake({ kind: 'db', dbRows: [], pageCount: 0 });
        expect(await adapter.fetchAllBlocks()).toEqual({ status: 'empty', kind: 'db' });
    });

    it('blocksReferencingPage：fromPage = page.title → 自身文字 → 未知頁面 回退鏈', async () => {
        const rows = [
            { 'full-title': 'linker text', page: { title: 'From Page' } },
            { 'full-title': 'self page text' },
            { uuid: 'x' },
        ];
        mock.DB.datascriptQuery = vi.fn(async () => rows.map((r) => [r]));
        expect(await adapter.blocksReferencingPage('Apple')).toEqual([
            { text: 'linker text', fromPage: 'From Page' },
            { text: 'self page text', fromPage: 'self page text' },
            { text: '', fromPage: '未知頁面' },
        ]);
    });

    it('keywordSearch：pageTitle 取 pull page.title；slice(limit)；full-title 優先', async () => {
        const rows = [
            dbBlockRow('k-1', 'raw', 'Kw One', 'Page A'),
            { uuid: 'k-2', title: 'Kw Two raw', page: { title: 'Page B' } },
            { uuid: 'k-3', title: 'Kw Three', page: {} },
        ];
        mock.DB.datascriptQuery = vi.fn(async () => rows.map((r) => [r]));
        expect(await adapter.keywordSearch('kw', 2)).toEqual([
            { uuid: 'k-1', pageTitle: 'Page A', text: 'Kw One' },
            { uuid: 'k-2', pageTitle: 'Page B', text: 'Kw Two raw' },
        ]);
    });
});

describe('DbGraphAdapter Editor API 讀取路徑（結構待 N12/N13）', () => {
    it('pageTree 取字用 fullTitle（可讀名），非 content（[[uuid]] 噪音）', async () => {
        mock.Editor.getPageBlocksTree = vi.fn(async () => [
            {
                uuid: 'e-1', fullTitle: 'Readably [[Page]]', content: 'raw [[uuid-1]]',
                children: [{ uuid: 'e-1-1', content: 'child raw', children: [] }],
            },
        ]);
        expect(await adapter.pageTree('Apple')).toEqual([
            {
                uuid: 'e-1', text: 'Readably [[Page]]',
                children: [{ uuid: 'e-1-1', text: 'child raw', children: [] }],
            },
        ]);
    });

    it('blockTree：不傳 includePage；頁面 uuid 回 nil → null（文案由 tools.ts 依 kind 區分）', async () => {
        mock.Editor.getBlock = vi.fn(async () => null);
        expect(await adapter.blockTree('page-uuid')).toBeNull();
        expect(mock.Editor.getBlock).toHaveBeenCalledWith('page-uuid', { includeChildren: true });
    });
});
