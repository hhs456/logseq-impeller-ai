// tests/stream.test.ts
import { describe, it, expect } from 'vitest';
import { parseSSE, ToolCallAccumulator } from '../src/llm/stream';

const enc = new TextEncoder();

function streamFromChunks(chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
    const u8 = chunks.map(c => (typeof c === 'string' ? enc.encode(c) : c));
    return new ReadableStream({
        start(controller) {
            u8.forEach(x => controller.enqueue(x));
            controller.close();
        },
    });
}

async function collect(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): Promise<string[]> {
    const out: string[] = [];
    for await (const data of parseSSE(stream, signal)) out.push(data);
    return out;
}

describe('P6a parseSSE（附錄 B.7）', () => {
    it('單事件被切成兩個 chunk，切點在 \\n\\n 中間 → 正確合併', async () => {
        const stream = streamFromChunks(['data: {"a":', '1}\n\n']);
        expect(await collect(stream)).toEqual(['{"a":1}']);
    });

    it('中文 UTF-8 三字节切在 chunk 邊界 → 無亂碼', async () => {
        const bytes = enc.encode('data: 你好\n\n');
        const split = 8; // 落在「好」的多字节序列中間
        const stream = streamFromChunks([bytes.slice(0, split), bytes.slice(split)]);
        expect(await collect(stream)).toEqual(['你好']);
    });

    it('CRLF 事件分隔等同 LF', async () => {
        const stream = streamFromChunks(['data: a\r\n\r\ndata: b\r\n\r\n']);
        expect(await collect(stream)).toEqual(['a', 'b']);
    });

    it('註解行、空事件被忽略；[DONE] 結束且不yield', async () => {
        const stream = streamFromChunks([
            ': OPENROUTER PROCESSING\n\n',
            'data: a\n\n',
            '\n',
            'data: [DONE]\n\n',
            'data: never\n\n',
        ]);
        expect(await collect(stream)).toEqual(['a']);
    });

    it('多行 data 以 \\n 合併', async () => {
        const stream = streamFromChunks(['data: line1\ndata: line2\n\n']);
        expect(await collect(stream)).toEqual(['line1\nline2']);
    });

    it('data: 後可有可無空白', async () => {
        const stream = streamFromChunks(['data:x\n\ndata: y\n\n']);
        expect(await collect(stream)).toEqual(['x', 'y']);
    });

    it('串流無 [DONE] 自然結束 → 視為結束', async () => {
        const stream = streamFromChunks(['data: a\n\n', 'data: b\n\n']);
        expect(await collect(stream)).toEqual(['a', 'b']);
    });

    it('最後一個事件無結尾空行 → 仍被解析（尾聲 flush）', async () => {
        const stream = streamFromChunks(['data: tail']);
        expect(await collect(stream)).toEqual(['tail']);
    });

    it('中止於事件中途中斷 pending read → AbortError', async () => {
        const controller = new AbortController();
        const stream = new ReadableStream<Uint8Array>({
            start(c) { c.enqueue(enc.encode('data: a\n\n')); },
            pull() { return new Promise<void>(() => { /* 永不 resolve */ }); },
        });
        const it = parseSSE(stream, controller.signal);
        expect((await it.next()).value).toBe('a');
        const pending = it.next();
        controller.abort();
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('閒置逾時 → IdleTimeoutError', async () => {
        const stream = new ReadableStream<Uint8Array>({
            start(c) { c.enqueue(enc.encode('data: a\n\n')); },
            pull() { return new Promise<void>(() => { /* hang */ }); },
        });
        const it = parseSSE(stream, undefined, { idleTimeoutMs: 30 });
        expect((await it.next()).value).toBe('a');
        await expect(it.next()).rejects.toMatchObject({ name: 'IdleTimeoutError' });
    });
});

describe('P6a ToolCallAccumulator（附錄 B.7）', () => {
    it('引數分 5 片 → 結算後 JSON.parse 成功', () => {
        const acc = new ToolCallAccumulator();
        acc.feed([{ index: 0, id: 'c1', function: { name: 'web_search', arguments: '{"que' } }]);
        acc.feed([{ index: 0, function: { arguments: 'ry":"' } }]);
        acc.feed([{ index: 0, function: { arguments: 'a' } }]);
        acc.feed([{ index: 0, function: { arguments: 'b' } }]);
        acc.feed([{ index: 0, function: { arguments: '"}' } }]);
        const calls = acc.finalize(0);
        expect(calls).toHaveLength(1);
        expect(calls[0].parseError).toBe(false);
        expect(JSON.parse(calls[0].function.arguments)).toEqual({ query: 'ab' });
    });

    it('每片都重複 id 與 name → 不累加成 idid', () => {
        const acc = new ToolCallAccumulator();
        acc.feed([{ index: 0, id: 'c1', function: { name: 'f', arguments: '{' } }]);
        acc.feed([{ index: 0, id: 'c1', function: { name: 'f', arguments: '}' } }]);
        const [call] = acc.finalize(0);
        expect(call.id).toBe('c1');
        expect(call.function.name).toBe('f');
    });

    it('兩個並行 tool_calls（index 0、1）交錯 → 各自完整', () => {
        const acc = new ToolCallAccumulator();
        acc.feed([{ index: 0, id: 'a', function: { name: 'fa', arguments: '{"x"' } }]);
        acc.feed([{ index: 1, id: 'b', function: { name: 'fb', arguments: '{"y"' } }]);
        acc.feed([{ index: 0, function: { arguments: ':1}' } }]);
        acc.feed([{ index: 1, function: { arguments: ':2}' } }]);
        const calls = acc.finalize(0);
        expect(calls.map(c => c.id)).toEqual(['a', 'b']);
        expect(JSON.parse(calls[0].function.arguments)).toEqual({ x: 1 });
        expect(JSON.parse(calls[1].function.arguments)).toEqual({ y: 2 });
    });

    it('無 index 的整包 tool call → 單項正確', () => {
        const acc = new ToolCallAccumulator();
        acc.feed([{ id: 'solo', function: { name: 'f', arguments: '{"a":1}' } }]);
        const calls = acc.finalize(0);
        expect(calls).toHaveLength(1);
        expect(calls[0].id).toBe('solo');
        expect(JSON.parse(calls[0].function.arguments)).toEqual({ a: 1 });
    });

    it('缺 id → 補 call_<iteration>_<index>', () => {
        const acc = new ToolCallAccumulator();
        acc.feed([{ index: 0, function: { name: 'f', arguments: '{}' } }]);
        expect(acc.finalize(3)[0].id).toBe('call_3_0');
    });

    it('非法 JSON 引數 → parseError 為 true（仍保留）', () => {
        const acc = new ToolCallAccumulator();
        acc.feed([{ index: 0, id: 'c', function: { name: 'f', arguments: '{"broken"' } }]);
        const [call] = acc.finalize(0);
        expect(call.parseError).toBe(true);
    });
});
