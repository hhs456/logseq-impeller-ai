// tests/agent.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installLogseqMock, LogseqMock } from './helpers/logseq-mock';
import { state, I18N } from '../src/config';

vi.mock('../src/utils/crypto', () => ({
    decryptApiKey: vi.fn(async () => 'decrypted-key'),
}));

import { agent } from '../src/agent';
import { actions } from '../src/actions';
import { renderUI } from '../src/ui';

const tick = (ms: number) => new Promise(r => setTimeout(r, ms));

let mock: LogseqMock;

function jsonOk(content: string) {
    return {
        ok: true,
        status: 200,
        headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
        json: async () => ({ choices: [{ message: { role: 'assistant', content } }] }),
        text: async () => '',
    };
}

function setupBase(opts: { msgCount?: number } = {}) {
    mock = installLogseqMock();
    mock.settings = {
        model: 'test/model',
        basePath: 'https://openrouter.ai/api/v1',
        apiKey: 'enc:whatever',
        temperature: 0.7,
        maxIterations: 7,
        enableStreaming: false,
    };
    state.t = I18N['en'];
    state.isVisible = true;
    state.isBusy = false;
    state.isCollapsed = false;
    state.isMemoryCollapsed = false;
    state.currentPageUuid = 'page-1';
    state.currentGraphPath = 'D:/graphs/test-graph';
    state.processingPageUuid = null;
    state.run = null;
    state.runSeq = 0;
    state.contextGen = 0;
    state.tempInput = '';
    state.drafts = {};

    const msgs: any[] = [];
    for (let i = 0; i < (opts.msgCount ?? 2); i++) {
        msgs.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `m${i}`, timestamp: 1 });
    }
    state.chatStore = { 'page-1': { name: 'Page 1', msgs } };
}

beforeEach(() => {
    setupBase();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('P3a: run 抽象與 isBusy（驗收 #4）', () => {
    it('15 則對話 sendMsg：fetch 期間 isBusy 恆 true、按鈕為 Stop；完成後復位', async () => {
        setupBase({ msgCount: 14 }); // +1 user = 15 > THRESHOLD(14) → 會壓縮
        const seen: { busy: boolean; act: string | null }[] = [];
        const fetchMock = vi.fn(async (_url: string, _init: any) => {
            const btn = parent.document.getElementById('ai-sidebar-send');
            seen.push({ busy: state.isBusy, act: btn?.getAttribute('data-ai-act') ?? null });
            return jsonOk('REPLY');
        });
        vi.stubGlobal('fetch', fetchMock);

        renderUI();
        state.tempInput = 'hello';
        state.drafts['page-1'] = 'hello';
        await agent.sendMsg();

        expect(seen.length).toBeGreaterThan(0);
        for (const s of seen) {
            expect(s.busy).toBe(true);
            expect(s.act).toBe('stopTask');
        }
        expect(state.isBusy).toBe(false);
        expect(state.run).toBeNull();
        const msgs = state.chatStore['page-1'].msgs;
        expect(msgs[msgs.length - 1].content).toBe('REPLY');
    });

    it('stopTask 中止進行中的 run', async () => {
        setupBase({ msgCount: 2 });
        const fetchMock = vi.fn((_url: string, init: any) => new Promise((_r, reject) => {
            const onAbort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            if (init.signal.aborted) onAbort();
            else init.signal.addEventListener('abort', onAbort);
        }));
        vi.stubGlobal('fetch', fetchMock);

        renderUI();
        state.tempInput = 'hi';
        state.drafts['page-1'] = 'hi';
        const p = agent.sendMsg();
        await tick(5);
        expect(state.isBusy).toBe(true);
        agent.stopTask();
        await p;
        expect(state.isBusy).toBe(false);
        expect(state.run).toBeNull();
    });
});

describe('P3a/N2: 壓縮期間中止不污染摘要、不發主請求', () => {
    it('compress 階段 stopTask → summary 未寫入、主 fetch 未呼叫、isBusy 復位', async () => {
        setupBase({ msgCount: 14 });
        let calls = 0;
        const fetchMock = vi.fn(async (_url: string, init: any) => {
            calls++;
            if (calls === 1) {
                agent.stopTask();
                await Promise.resolve();
                if (init.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
            }
            return jsonOk('SHOULD-NOT-APPEAR');
        });
        vi.stubGlobal('fetch', fetchMock);

        renderUI();
        state.tempInput = 'go';
        state.drafts['page-1'] = 'go';
        await agent.sendMsg();

        expect(calls).toBe(1);
        expect(state.chatStore['page-1'].summary ?? '').toBe('');
        expect(state.isBusy).toBe(false);
    });
});

describe('P3b: 世代號（切頁 race）', () => {
    it('慢 A 後接快 C → currentPageUuid === C（過期回調被丟棄）', async () => {
        setupBase();
        let graphCalls = 0;
        mock.App.getCurrentGraph = vi.fn(async () => {
            graphCalls++;
            if (graphCalls === 1) { await tick(60); }
            return { path: 'D:/graphs/test-graph' };
        }) as any;
        mock.Editor.getCurrentPage = vi.fn(async () => ({ uuid: 'page-C' })) as any;
        mock.Editor.getBlock = vi.fn(async (uuid: string) => ({ uuid, page: { id: uuid } })) as any;
        mock.Editor.getPage = vi.fn(async (id: string) => ({ uuid: id, name: 'P' + id, originalName: 'P' + id })) as any;

        const pSlow = actions.updatePageContext();   // gen 1，getCurrentGraph 慢
        const pFast = actions.updatePageContext();   // gen 2，快
        await Promise.all([pSlow, pFast]);
        await tick(120);

        expect(state.currentPageUuid).toBe('page-C');
    });
});

describe('P3b/N6: 切圖譜時 ask 進行中不拋 TypeError', () => {
    it('handleGraphChange 中止進行中的 run 並清快取，sendMsg 平穩結束', async () => {
        setupBase({ msgCount: 2 });
        const fetchMock = vi.fn((_url: string, init: any) => new Promise((_r, reject) => {
            const onAbort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            if (init.signal.aborted) onAbort();
            else init.signal.addEventListener('abort', onAbort);
        }));
        vi.stubGlobal('fetch', fetchMock);
        mock.App.getCurrentGraph = vi.fn(async () => ({ path: 'D:/graphs/OTHER-graph' })) as any;

        renderUI();
        state.tempInput = 'hi';
        state.drafts['page-1'] = 'hi';
        const p = agent.sendMsg();
        await tick(5);
        expect(state.isBusy).toBe(true);

        await expect(actions.handleGraphChange()).resolves.not.toThrow();
        await expect(p).resolves.not.toThrow();

        expect(state.isBusy).toBe(false);
        expect(state.chatStore['page-1']).toBeUndefined();
    });
});

describe('P3c: 逾時', () => {
    it('fetch 掛起 → 推進 120s → status error、顯示 timeout、isBusy 復位', async () => {
        setupBase({ msgCount: 2 });
        const fetchMock = vi.fn((_url: string, init: any) => new Promise((_r, reject) => {
            const onAbort = () => reject(Object.assign(new Error('timeout'), { name: 'AbortError' }));
            if (init.signal.aborted) onAbort();
            else init.signal.addEventListener('abort', onAbort);
        }));
        vi.stubGlobal('fetch', fetchMock);
        vi.useFakeTimers();

        renderUI();
        state.tempInput = 'hi';
        state.drafts['page-1'] = 'hi';
        const p = agent.sendMsg();
        await vi.advanceTimersByTimeAsync(120_000);
        await p;

        expect(state.isBusy).toBe(false);
        expect(state.run).toBeNull();
        expect(mock.UI.showMsg).toHaveBeenCalledWith(state.t.timeout, 'error');
    });
});

describe('P3c: 非 JSON 回應', () => {
    it('content-type text/html → 不拋「Unexpected token <」，走 error 路徑', async () => {
        setupBase({ msgCount: 2 });
        const fetchMock = vi.fn(async () => ({
            ok: true,
            status: 200,
            headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/html' : null) },
            text: async () => '<html>gateway error</html>',
        }));
        vi.stubGlobal('fetch', fetchMock);

        renderUI();
        state.tempInput = 'hi';
        state.drafts['page-1'] = 'hi';
        await agent.sendMsg();

        expect(state.isBusy).toBe(false);
        expect(mock.UI.showMsg).toHaveBeenCalledWith('❌ API 回傳非 JSON 內容', 'error');
        const msgs = state.chatStore['page-1'].msgs;
        expect(msgs[msgs.length - 1].role).toBe('user');
    });
});

describe('P3c: 無頁面時 sendMsg toast', () => {
    it('currentPageUuid 為 null → toast noPage，不發請求', async () => {
        setupBase();
        state.currentPageUuid = null;
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        state.tempInput = 'hi';
        await agent.sendMsg();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(mock.UI.showMsg).toHaveBeenCalledWith(state.t.noPage, 'warning');
    });
});
