// tests/agent-stream.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installLogseqMock, LogseqMock } from './helpers/logseq-mock';
import { state, I18N } from '../src/config';

vi.mock('../src/utils/crypto', () => ({ decryptApiKey: vi.fn(async () => 'k') }));
const executeToolCallMock = vi.fn(async (_name: string, _args: any) => 'TOOL OUT');
vi.mock('../src/tools', () => ({
    getAvailableTools: () => null,
    executeToolCall: (name: string, args: any) => executeToolCallMock(name, args),
}));

import { agent, _resetNoStreamSet } from '../src/agent';

const enc = new TextEncoder();
let mock: LogseqMock;

function sseStream(events: string[], hangAfter?: number) {
    return new ReadableStream<Uint8Array>({
        start(c) { events.forEach(e => c.enqueue(enc.encode(e))); if (hangAfter === undefined) c.close(); },
        pull() { if (hangAfter !== undefined) return new Promise<void>(() => {}); },
    });
}

function sseResponse(events: string[], hangAfter?: number) {
    return {
        ok: true, status: 200,
        headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
        body: sseStream(events, hangAfter),
        json: async () => { throw new Error('no json'); },
        text: async () => '',
    };
}

function jsonResponse(content: string) {
    return {
        ok: true, status: 200,
        headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
        body: null,
        json: async () => ({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] }),
        text: async () => '',
    };
}

function setup(stream = true) {
    mock = installLogseqMock();
    mock.settings = { model: 'm', basePath: 'https://openrouter.ai/api/v1', apiKey: 'k', temperature: 0.7, maxIterations: 7, enableStreaming: stream };
    state.t = I18N['en'];
    state.liveTrace = [];
    _resetNoStreamSet();
    executeToolCallMock.mockClear();
}

beforeEach(() => setup());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('P6a runCompletion 串流', () => {
    it('SSE 文字串流 → 累積為 ok content，onDelta 遞增', async () => {
        const fetchMock = vi.fn(async (_url: string, _init: any) => sseResponse([
            'data: {"choices":[{"delta":{"content":"He"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n',
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
            'data: [DONE]\n\n',
        ]));
        vi.stubGlobal('fetch', fetchMock);
        const deltas: string[] = [];
        const res = await agent.runCompletion([{ role: 'user', content: 'hi' }], {
            signal: new AbortController().signal,
            onDelta: (t) => deltas.push(t),
        });
        expect(res.status).toBe('ok');
        expect(res.content).toBe('Hello');
        expect(deltas).toEqual(['He', 'Hello']);
        expect(JSON.parse(fetchMock.mock.calls[0][1].body).stream).toBe(true);
    });

    it('串流 tool_calls → 執行工具、續接最終文字，trace 完成', async () => {
        let call = 0;
        const fetchMock = vi.fn(async () => {
            call++;
            if (call === 1) return sseResponse([
                'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"web_search","arguments":"{\\"query\\":\\"x\\"}"}}]}}]}\n\n',
                'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
                'data: [DONE]\n\n',
            ]);
            return sseResponse([
                'data: {"choices":[{"delta":{"content":"Final"}}]}\n\n',
                'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
                'data: [DONE]\n\n',
            ]);
        });
        vi.stubGlobal('fetch', fetchMock);
        const res = await agent.runCompletion([{ role: 'user', content: 'hi' }], { signal: new AbortController().signal });
        expect(res.status).toBe('ok');
        expect(res.content).toBe('Final');
        expect(executeToolCallMock).toHaveBeenCalledTimes(1);
        expect(res.trace?.find(t => t.name === 'web_search')?.status).toBe('done');
    });

    it('降級 2：串流 4xx → 以非串流重試一次，第二次 body 不含 stream', async () => {
        const bodies: any[] = [];
        const fetchMock = vi.fn(async (_url: string, init: any) => {
            const body = JSON.parse(init.body);
            bodies.push(body);
            if (body.stream) return { ok: false, status: 400, headers: { get: () => null }, json: async () => ({}), text: async () => '' };
            return jsonResponse('NONSTREAM OK');
        });
        vi.stubGlobal('fetch', fetchMock);
        const res = await agent.runCompletion([{ role: 'user', content: 'hi' }], { signal: new AbortController().signal });
        expect(res.status).toBe('ok');
        expect(res.content).toBe('NONSTREAM OK');
        expect(bodies).toHaveLength(2);
        expect(bodies[0].stream).toBe(true);
        expect(bodies[1].stream).toBeUndefined();
    });

    it('串流中途頂層 error 事件 → status error、保留已累積內容', async () => {
        const fetchMock = vi.fn(async () => sseResponse([
            'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
            'data: {"error":{"message":"boom"}}\n\n',
        ]));
        vi.stubGlobal('fetch', fetchMock);
        const res = await agent.runCompletion([{ role: 'user', content: 'hi' }], { signal: new AbortController().signal });
        expect(res.status).toBe('error');
        expect(res.content).toBe('partial');
        expect(mock.UI.showMsg).toHaveBeenCalledWith(state.t.streamInterrupted, 'error');
    });

    it('B.5：中止於 tool_call 引數中途 → 不執行工具、partial 保留、status aborted', async () => {
        const controller = new AbortController();
        const fetchMock = vi.fn(async () => sseResponse([
            'data: {"choices":[{"delta":{"content":"lead"}}]}\n\n',
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"web_search","arguments":"{\\"que"}}]}}]}\n\n',
        ], /* hang */ 1));
        vi.stubGlobal('fetch', fetchMock);
        const p = agent.runCompletion([{ role: 'user', content: 'hi' }], { signal: controller.signal });
        await new Promise(r => setTimeout(r, 10));
        controller.abort();
        const res = await p;
        expect(res.status).toBe('aborted');
        expect(executeToolCallMock).not.toHaveBeenCalled();
        expect(res.content).toContain('lead');
    });

    it('enableStreaming=false → 永不送 stream，走非串流', async () => {
        setup(false);
        const fetchMock = vi.fn(async (_url: string, _init: any) => jsonResponse('plain'));
        vi.stubGlobal('fetch', fetchMock);
        const res = await agent.runCompletion([{ role: 'user', content: 'hi' }], { signal: new AbortController().signal });
        expect(res.content).toBe('plain');
        expect(JSON.parse(fetchMock.mock.calls[0][1].body).stream).toBeUndefined();
    });
});
