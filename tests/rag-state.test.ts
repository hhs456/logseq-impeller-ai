// tests/rag-state.test.ts
// Phase 0 驗收：syncVectorDB 四條路徑（failed / unsupported / empty / ready）
// 與暖快取回歸（修 F）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { installLogseqMock, LogseqMock } from './helpers/logseq-mock';
import { createSchemaAwareFake, fileBlockRow } from './helpers/graph-fake';
import { I18N } from '../src/config';

// jsdom 沒有 crypto.subtle；以確定性假實作替代（只需快取 key 前後一致，不需真实 SHA-256）
function fakeCrypto() {
    return {
        subtle: {
            digest: async (_algo: string, data: Uint8Array): Promise<ArrayBuffer> => {
                const out = new Uint8Array(32);
                let h = 0x811c9dc5;
                for (let i = 0; i < data.length; i++) {
                    h ^= data[i];
                    h = Math.imul(h, 0x01000193) >>> 0;
                    out[i % 32] = (out[i % 32] + (h & 0xff)) & 0xff;
                }
                out[data.length % 32] = (out[data.length % 32] + (data.length & 0xff)) & 0xff;
                return out.buffer;
            },
        },
    };
}

const hoisted = vi.hoisted(() => ({
    orama: { createCalls: 0, docs: [] as any[], searchResult: { hits: [] as any[] } },
    transformers: { pipelineCalls: 0 },
}));

vi.mock('@orama/orama', () => ({
    create: vi.fn(async () => {
        hoisted.orama.createCalls++;
        return { __fakeOrama: true };
    }),
    insertMultiple: vi.fn(async (_db: any, docs: any[]) => {
        hoisted.orama.docs.push(...docs);
    }),
    search: vi.fn(async () => hoisted.orama.searchResult),
}));

vi.mock('@huggingface/transformers', () => ({
    env: {},
    pipeline: vi.fn(async () => {
        hoisted.transformers.pipelineCalls++;
        return async (_text: string, _opts: any) => ({ data: new Float32Array(512) });
    }),
}));

let mock: LogseqMock;

beforeEach(() => {
    vi.stubGlobal('crypto', fakeCrypto());
    mock = installLogseqMock();
    hoisted.orama.createCalls = 0;
    hoisted.orama.docs = [];
    hoisted.orama.searchResult = { hits: [] };
    hoisted.transformers.pipelineCalls = 0;
});

afterEach(() => {
    vi.unstubAllGlobals();
});

// 每個情境都要乾淨的模組狀態（extractor / vectorDb / indexState / 探測快取）
async function loadRag() {
    vi.resetModules();
    return await import('../src/rag');
}

async function sha16(text: string): Promise<string> {
    const data = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

async function seedIdb(key: string, value: number[]): Promise<void> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('ImpellerRAG_Cache', 1);
        req.onupgradeneeded = () => {
            const d = req.result;
            if (!d.objectStoreNames.contains('embeddings')) d.createObjectStore('embeddings');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('embeddings', 'readwrite');
        tx.objectStore('embeddings').put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    db.close();
}

describe('syncVectorDB 狀態機', () => {
    it('(1) fetch 拋錯 → failed、vectorDb 清空、error 彈窗', async () => {
        mock.DB.datascriptQuery = vi.fn(async () => { throw new Error('boom'); });
        const rag = await loadRag();
        await rag.syncVectorDB();
        expect(rag.getIndexState()).toEqual({ status: 'failed', message: 'boom' });
        expect(mock.UI.showMsg).toHaveBeenCalledWith(I18N.en.ragSyncFailed, 'error');
        const outcome = await rag.searchSimilarBlocks('x');
        expect(outcome).toEqual({ status: 'unavailable', reason: 'failed' });
    });

    it('(2) db 圖譜 + adapter 停用 → unsupported、不執行查詢、warning 僅一次且無 success', async () => {
        mock.App.getInfo = vi.fn(async () => ({ version: '0.11.0', supportDb: true }));
        mock.App.checkCurrentIsDbGraph = vi.fn(async () => true);
        mock.DB.datascriptQuery = vi.fn(async () => { throw new Error('must not run'); });
        const rag = await loadRag();
        await rag.syncVectorDB();
        await rag.syncVectorDB(); // 同 (graphKey, reason) 不得重複提示
        expect(rag.getIndexState()).toEqual({ status: 'unsupported', reason: 'db-adapter-disabled' });
        expect(mock.DB.datascriptQuery).not.toHaveBeenCalled();
        const warnings = mock.UI.showMsg.mock.calls.filter((c: any[]) => c[1] === 'warning');
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toEqual([I18N.en.ragDbUnsupported, 'warning', { timeout: 0 }]);
        expect(mock.UI.showMsg.mock.calls.some((c: any[]) => c[1] === 'success')).toBe(false);
        const outcome = await rag.searchSimilarBlocks('x');
        expect(outcome).toEqual({ status: 'unavailable', reason: 'unsupported' });
    });

    it('(3) file 空圖 + canary 0 → empty、不彈窗', async () => {
        mock.DB.datascriptQuery = createSchemaAwareFake({ kind: 'file', fileRows: [], pageCount: 0 });
        const rag = await loadRag();
        await rag.syncVectorDB();
        expect(rag.getIndexState()).toEqual({ status: 'empty' });
        expect(mock.UI.showMsg).not.toHaveBeenCalled();
        const outcome = await rag.searchSimilarBlocks('x');
        expect(outcome).toEqual({ status: 'unavailable', reason: 'empty-graph' });
    });

    it('(4) file 零結果 + canary > 20 → unsupported/schema-mismatch', async () => {
        mock.DB.datascriptQuery = createSchemaAwareFake({ kind: 'file', fileRows: [], pageCount: 50 });
        const rag = await loadRag();
        await rag.syncVectorDB();
        expect(rag.getIndexState()).toEqual({ status: 'unsupported', reason: 'schema-mismatch' });
        const warnings = mock.UI.showMsg.mock.calls.filter((c: any[]) => c[1] === 'warning');
        expect(warnings).toHaveLength(1);
    });

    it('(5) 成功路徑（冷快取）→ ready{blockCount}、模型載入一次、Orama 重建', async () => {
        const rows = [
            fileBlockRow('uuid-ok-1', 'hello world', 'Page One'),
            fileBlockRow('uuid-ok-2', 'second block', 'Page Two'),
        ];
        mock.DB.datascriptQuery = createSchemaAwareFake({ kind: 'file', fileRows: rows, pageCount: 2 });
        const rag = await loadRag();
        await rag.syncVectorDB();
        const st = rag.getIndexState() as any;
        expect(st.status).toBe('ready');
        expect(st.blockCount).toBe(2);
        expect(typeof st.builtAt).toBe('number');
        expect(hoisted.transformers.pipelineCalls).toBe(1);
        expect(hoisted.orama.createCalls).toBe(1);
        expect(hoisted.orama.docs).toHaveLength(2);
        expect(mock.UI.showMsg.mock.calls.some((c: any[]) => c[1] === 'success')).toBe(true);
    });

    it('(6) 暖快取回歸（修 F）：同步零推論，搜尋時 lazy 載入 extractor 並回 hits', async () => {
        const content = 'warm cache content';
        const rows = [fileBlockRow('uuid-warm-1', content, 'Warm Page')];
        const hash = await sha16(content);
        await seedIdb(`test-graph_uuid-warm-1_${hash}`, [0.5, 0.25]);
        mock.DB.datascriptQuery = createSchemaAwareFake({ kind: 'file', fileRows: rows, pageCount: 1 });
        const rag = await loadRag();

        await rag.syncVectorDB();
        expect(hoisted.transformers.pipelineCalls).toBe(0);
        expect(rag.getIndexState().status).toBe('ready');

        hoisted.orama.searchResult = {
            hits: [{ document: { id: 'uuid-warm-1', pageName: 'Warm Page', content } }],
        };
        const outcome = await rag.searchSimilarBlocks('anything');
        expect(hoisted.transformers.pipelineCalls).toBe(1);
        expect(outcome).toEqual({
            status: 'ok',
            hits: [{ id: 'uuid-warm-1', content: `(來自頁面 [[Warm Page]]) ${content}` }],
        });
    });

    it('(7) 探測 rejection 是純物件（2.0.2 實測形狀）→ 錯誤訊息帶來源與負載，非 [object Object]', async () => {
        mock.App.getInfo = vi.fn(async () => ({ version: '2.0.2', supportDb: true }));
        mock.App.checkCurrentIsDbGraph = vi.fn(async () => { throw { error: 'not-ready', code: 42 }; });
        const rag = await loadRag();

        await rag.syncVectorDB();
        const st = rag.getIndexState() as any;
        expect(st.status).toBe('failed');
        expect(st.message).toBe('checkCurrentIsDbGraph rejected: {"error":"not-ready","code":42}');
        expect(rag.getRagDiagReport()).toContain('failed');
        expect(rag.getRagDiagReport()).toContain('not-ready');
        expect(rag.getRagDiagReport()).not.toContain('[object Object]');
    });
});
