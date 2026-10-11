// tests/rag-race.test.ts
// 計畫 §4.5／N17：切圖競態——A 圖同步中切 B 圖 → B 的索引不含 A 內容、
// A 的遲到結果（成功或例外）被丟棄、同一時間只有一輪佔用 extractor。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { installLogseqMock, LogseqMock } from './helpers/logseq-mock';
import { fileBlockRow } from './helpers/graph-fake';

// jsdom 沒有 crypto.subtle；與 rag-state.test.ts 相同的確定性假實作
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
    log: [] as string[],
    embedGate: null as any,
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
        return async (_text: string, _opts: any) => {
            hoisted.log.push('embed');
            if (hoisted.embedGate) await hoisted.embedGate.promise;
            return { data: new Float32Array(512) };
        };
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
    hoisted.log = [];
    hoisted.embedGate = null;
});

afterEach(() => {
    vi.unstubAllGlobals();
});

function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: any) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

async function waitFor(cond: () => boolean, what: string, ms = 2000): Promise<void> {
    const t0 = Date.now();
    while (!cond()) {
        if (Date.now() - t0 > ms) throw new Error(`waitFor timeout: ${what}`);
        await new Promise((r) => setTimeout(r, 5));
    }
}

// 每個情境都要乾淨的模組狀態（syncGen / syncChain / vectorDb / indexState / 快取）
async function loadRag() {
    vi.resetModules();
    return await import('../src/rag');
}

// 內容查詢可掛起的 fake：第一次 :block/content 查詢回 gate，其後回 rowsB
function gateableFetch(gate: { promise: Promise<any[]> }, rowsB: any[]) {
    let fetchCount = 0;
    return vi.fn(async (query: string) => {
        if (query.includes('(count')) return 0;
        if (query.includes(':block/content')) {
            fetchCount++;
            if (fetchCount === 1) return gate.promise;
            return rowsB.map((r) => [r]);
        }
        return [];
    });
}

describe('切圖競態（§4.5／N17）', () => {
    it('A 同步中切 B：A 遲到結果被丟棄，B 索引不含 A 內容', async () => {
        const rowsA = [fileBlockRow('race-a-1', 'ALPHA content', 'Page A')];
        const rowsB = [fileBlockRow('race-b-1', 'BETA content', 'Page B')];
        const gate = deferred<any[]>();
        mock.DB.datascriptQuery = gateableFetch(gate, rowsB);

        const rag = await loadRag();
        const pA = rag.syncVectorDB();          // gen 1：A 圖，掛在 gate
        await waitFor(() => (mock.DB.datascriptQuery as any).mock.calls.length === 1, 'A fetch started');
        rag.onGraphSwitched();                  // ① 同步重置（作廢 gen 1）
        const pB = rag.syncVectorDB();          // 排隊：B 圖

        gate.resolve(rowsA.map((r) => [r]));    // A 的查詢遲到完成
        await pA;
        await pB;

        const st = rag.getIndexState() as any;
        expect(st.status).toBe('ready');
        expect(st.blockCount).toBe(1);
        // 關鍵：索引裡只有 B 的內容，A 的遲到寫入被世代檢查丟棄
        expect(hoisted.orama.docs).toHaveLength(1);
        expect(hoisted.orama.docs[0].content).toBe('BETA content');
        expect(hoisted.orama.docs.some((d: any) => d.content === 'ALPHA content')).toBe(false);
        expect(hoisted.orama.createCalls).toBe(1); // A 輪在 create 之前就返回了
    });

    it('A 遲到拋錯：不彈 error、不覆寫 B 的狀態（catch 也有世代檢查）', async () => {
        const rowsB = [fileBlockRow('race-c-1', 'BETA two content', 'Page B2')];
        const gate = deferred<any[]>();
        mock.DB.datascriptQuery = gateableFetch(gate, rowsB);

        const rag = await loadRag();
        const pA = rag.syncVectorDB();
        await waitFor(() => (mock.DB.datascriptQuery as any).mock.calls.length === 1, 'A fetch started');
        rag.onGraphSwitched();
        const pB = rag.syncVectorDB();

        gate.reject(new Error('A boom'));       // A 的查詢遲到失敗
        await pA;
        await pB;

        expect(rag.getIndexState().status).toBe('ready');
        const errorToasts = mock.UI.showMsg.mock.calls.filter((c: any[]) => c[1] === 'error');
        expect(errorToasts).toHaveLength(0);
        expect(hoisted.orama.docs).toHaveLength(1);
        expect(hoisted.orama.docs[0].content).toBe('BETA two content');
    });

    it('syncChain：新同步取代在飛輪且不併發——連 embed 迴圈中途也能被丟棄（同時只有一輪佔用 extractor）', async () => {
        const rows = [
            fileBlockRow('race-d-1', 'serial one', 'Page D'),
            fileBlockRow('race-d-2', 'serial two', 'Page D'),
        ];
        let fetchCount = 0;
        const fetchGate = deferred<any[]>();
        mock.DB.datascriptQuery = vi.fn(async (query: string) => {
            if (query.includes('(count')) return 0;
            if (query.includes(':block/content')) {
                fetchCount++;
                if (fetchCount === 1) return fetchGate.promise;
                return rows.map((r) => [r]);
            }
            return [];
        });

        const rag = await loadRag();
        const p1 = rag.syncVectorDB();                       // gen 1：掛在 fetchGate
        await waitFor(() => fetchCount === 1, 'run1 fetch');
        const p2 = rag.syncVectorDB();                       // gen 2：排隊，不得與 gen 1 併發
        await new Promise((r) => setTimeout(r, 10));
        expect(fetchCount).toBe(1);                          // 鏈序列化：gen 2 尚未開始 fetch

        hoisted.embedGate = deferred();                      // gen 2 的第一個 embed 將掛在此（gen 1 不會走到 embed）
        fetchGate.resolve(rows.map((r) => [r]));             // gen 1 遲到 → 世代檢查丟棄
        await waitFor(() => hoisted.log.filter((x) => x === 'embed').length === 1, 'run2 embed1');
        expect(fetchCount).toBe(2);

        const p3 = rag.syncVectorDB();                       // gen 3：取代卡在 embed 的 gen 2
        hoisted.embedGate!.resolve({});                      // gen 2 醒來 → stale → 丟棄，第二筆不 embed
        hoisted.embedGate = null;
        await p1; await p2; await p3;

        // gen 1 丟棄於 fetch 後；gen 2 丟棄於 embed 迴圈內（只 embed 過 1 筆）；
        // gen 3 完整跑完：2 筆 cold embed（gen 2 來不及寫快取）
        expect(fetchCount).toBe(3);
        expect(hoisted.log.filter((x) => x === 'embed')).toHaveLength(3);
        expect(hoisted.orama.createCalls).toBe(1);           // 只有 gen 3 到達 create
        expect(hoisted.orama.docs).toHaveLength(2);
        const st = rag.getIndexState() as any;
        expect(st.status).toBe('ready');
        expect(st.blockCount).toBe(2);
    });

    it('onGraphSwitched 同步清空：切換瞬間舊索引不可查（窗口關閉）', async () => {
        const rows = [fileBlockRow('race-e-1', 'stale index', 'Page E')];
        mock.DB.datascriptQuery = vi.fn(async (query: string) => {
            if (query.includes('(count')) return 0;
            return rows.map((r) => [r]);
        });

        const rag = await loadRag();
        await rag.syncVectorDB();
        expect(rag.getIndexState().status).toBe('ready');

        rag.onGraphSwitched();
        expect(rag.getIndexState()).toEqual({ status: 'idle' });
        const outcome = await rag.searchSimilarBlocks('stale');
        expect(outcome).toEqual({ status: 'unavailable', reason: 'idle' });
    });

    it('building 狀態帶 gen（Phase 1 脚手架填實，差異 #4）', async () => {
        const rows = [fileBlockRow('race-f-1', 'gen check', 'Page F')];
        const gate = deferred<any[]>();
        mock.DB.datascriptQuery = gateableFetch(gate, rows);

        const rag = await loadRag();
        const p = rag.syncVectorDB();
        await waitFor(() => rag.getIndexState().status === 'building', 'building state');

        const st = rag.getIndexState() as any;
        expect(st.status).toBe('building');
        expect(typeof st.gen).toBe('number');

        gate.resolve(rows.map((r) => [r]));
        await p;
        expect(rag.getIndexState().status).toBe('ready');
    });

    it('resetAdapter 接線：切圖後 file→db 探測重算，B 輪正確回 unsupported', async () => {
        const rows = [fileBlockRow('race-g-1', 'file first', 'Page G')];
        mock.DB.datascriptQuery = vi.fn(async (query: string) => {
            if (query.includes('(count')) return 0;
            return rows.map((r) => [r]);
        });

        const rag = await loadRag();
        await rag.syncVectorDB();
        expect(rag.getIndexState().status).toBe('ready');
        const callsAfterA = (mock.DB.datascriptQuery as any).mock.calls.length;

        // 切到「新圖」＝ DB 圖譜（旗標關）
        rag.onGraphSwitched();
        mock.App.getInfo = vi.fn(async () => ({ version: '0.11.0', supportDb: true }));
        mock.App.checkCurrentIsDbGraph = vi.fn(async () => true);

        await rag.syncVectorDB();
        expect(rag.getIndexState()).toEqual({ status: 'unsupported', reason: 'db-adapter-disabled' });
        // B 輪不得執行任何 datalog（kind 快取若未清，會誤用 file adapter 查詢）
        expect((mock.DB.datascriptQuery as any).mock.calls.length).toBe(callsAfterA);
    });
});

// 診斷外露是夜版判讀的唯一依據（logger.info/warn 在 prod 被拔掉），故要有測試
describe('診斷外露（N9 blockCount／N17 丟棄點／N21 切圖計數）', () => {
    it('遲到輪記錄死在哪個邊界，ready 帶 blockCount，摘要計數正確', async () => {
        const rowsA = [fileBlockRow('diag-a-1', 'ALPHA diag', 'Page A')];
        const rowsB = [fileBlockRow('diag-b-1', 'BETA diag', 'Page B')];
        const gate = deferred<any[]>();
        mock.DB.datascriptQuery = gateableFetch(gate, rowsB);

        const rag = await loadRag();
        const pA = rag.syncVectorDB();
        await waitFor(() => (mock.DB.datascriptQuery as any).mock.calls.length === 1, 'A fetch started');
        rag.onGraphSwitched();
        const pB = rag.syncVectorDB();

        gate.resolve(rowsA.map((r) => [r]));
        await pA;
        await pB;

        const report = rag.getRagDiagReport();
        // N17 的判讀點：必須看見 at=fetch（寫 vectorDb 之前），而非 at=buildIndex
        expect(report).toContain('sync-drop');
        expect(report).toContain('at=fetch');
        expect(report).not.toContain('at=buildIndex');
        // N9 的判讀點：blockCount 要在報告裡可读
        expect(report).toContain('fetch-ok');
        expect(report).toContain('blocks=1');
        expect(report).toContain('ready');
        expect(report).toContain('blockCount=1');

        const summary = rag.getRagDiagSummary();
        expect(summary).toContain('drops=1');
        expect(summary).toContain('switches=1');
        expect(summary).toContain('blockCount=1');
    });

    it('N21：同圖誤發事件也要被計數（switches 是判讀依據）', async () => {
        const rows = [fileBlockRow('diag-c-1', 'switch count', 'Page C')];
        mock.DB.datascriptQuery = vi.fn(async (query: string) => {
            if (query.includes('(count')) return 0;
            return rows.map((r) => [r]);
        });

        const rag = await loadRag();
        await rag.syncVectorDB();
        expect(rag.getRagDiagSummary()).toContain('switches=0');

        rag.onGraphSwitched();
        rag.onGraphSwitched();
        expect(rag.getRagDiagSummary()).toContain('switches=2');
    });

    it('旗標關的 DB 圖譜：db-gated 可見（證明閘生效而非靜默）', async () => {
        mock.App.getInfo = vi.fn(async () => ({ version: '0.11.0', supportDb: true }));
        mock.App.checkCurrentIsDbGraph = vi.fn(async () => true);

        const rag = await loadRag();
        await rag.syncVectorDB();

        expect(rag.getRagDiagReport()).toContain('db-gated');
        expect(rag.getRagDiagReport()).toContain('fetch-unsupported');
        expect(rag.getRagDiagReport()).toContain('reason=db-adapter-disabled');
    });

    it('globalThis.__impellerDiag 可供 DevTools（iframe context）直接讀取', async () => {
        const rows = [fileBlockRow('diag-d-1', 'global hook', 'Page D')];
        mock.DB.datascriptQuery = vi.fn(async (query: string) => {
            if (query.includes('(count')) return 0;
            return rows.map((r) => [r]);
        });

        const rag = await loadRag();
        await rag.syncVectorDB();

        const hook = (globalThis as any).__impellerDiag;
        expect(typeof hook).toBe('function');
        const snap = hook();
        expect(snap.state.status).toBe('ready');
        expect(snap.state.blockCount).toBe(1);
        expect(typeof snap.gen).toBe('number');
        expect(Array.isArray(snap.history)).toBe(true);
        expect(snap.summary).toBe(rag.getRagDiagSummary());
    });
});
