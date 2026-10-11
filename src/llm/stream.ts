// src/llm/stream.ts
// 純函式串流解析，不依賴 logseq 全域（可獨立單元測試）。協定細節見計畫附錄 B。

export interface SseOptions {
    idleTimeoutMs?: number;
}

const EVENT_SEP = /\r?\n\r?\n/;

/**
 * 解析 SSE body，逐一 yield 每個事件的 `data` 負載（已剝除註解、合並多行 data）。
 * - `[DONE]` 由呼叫端判定；本產生器遇到 `[DONE]` 即停止。
 * - 多位元組 UTF-8 跨 chunk 以 TextDecoder({stream:true}) 處理（中文）。
 * - 閒置逾時：每次讀取重置計時器。
 */
export async function* parseSSE(
    body: ReadableStream<Uint8Array>,
    signal?: AbortSignal,
    opts: SseOptions = {},
): AsyncGenerator<string> {
    const idleMs = opts.idleTimeoutMs ?? 60_000;
    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    const clearIdle = () => { if (idleTimer) { clearTimeout(idleTimer); idleTimer = undefined; } };

    const readChunk = (): Promise<{ done: boolean; value?: Uint8Array }> => {
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (fn: () => void) => {
                if (settled) return;
                settled = true;
                clearIdle();
                if (signal) signal.removeEventListener('abort', onAbort);
                fn();
            };
            const onAbort = () => finish(() => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
            idleTimer = setTimeout(() => finish(() => reject(Object.assign(new Error('stream idle timeout'), { name: 'IdleTimeoutError' }))), idleMs);
            if (signal?.aborted) { onAbort(); return; }
            signal?.addEventListener('abort', onAbort, { once: true });
            reader.read().then(
                (res) => finish(() => resolve(res)),
                (err) => finish(() => reject(err)),
            );
        });
    };

    const processEvent = (rawEvent: string): string | null => {
        const dataLines: string[] = [];
        for (const line of rawEvent.split(/\r?\n/)) {
            if (!line) continue;
            if (line.startsWith(':')) continue;          // 註解 / keep-alive
            if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).replace(/^ /, ''));
            }
            // event:/id:/retry: 等欄位對我們無用 → 忽略
        }
        if (dataLines.length === 0) return null;
        return dataLines.join('\n');
    };

    try {
        while (true) {
            if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
            const { done, value } = await readChunk();
            if (done) break;
            buffer += decoder.decode(value!, { stream: true });

            let sep: RegExpMatchArray | null;
            while ((sep = buffer.match(EVENT_SEP)) && sep.index !== undefined) {
                const rawEvent = buffer.slice(0, sep.index);
                buffer = buffer.slice(sep.index + sep[0].length);
                const data = processEvent(rawEvent);
                if (data !== null) {
                    if (data === '[DONE]') return;
                    yield data;
                }
            }
        }

        // 尾聲：無分隔字的殘留事件（部分伺服器最後一個事件無結尾空行）
        buffer += decoder.decode();
        const tail = processEvent(buffer);
        if (tail !== null && tail !== '[DONE]') yield tail;
    } finally {
        clearIdle();
        reader.cancel().catch(() => { /* ignore */ });
        try { (reader as any).releaseLock?.(); } catch { /* ignore */ }
    }
}

// ─────────────────────────────────────────────
// tool_calls 聚合（附錄 B.3）
// ─────────────────────────────────────────────
export interface AccumulatedCall {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
    parseError: boolean;
}

interface Slot { id?: string; name?: string; args: string; }

export class ToolCallAccumulator {
    private items: Slot[] = [];

    feed(deltaToolCalls: any[] | undefined): void {
        if (!deltaToolCalls) return;
        for (const tc of deltaToolCalls) {
            let idx: number;
            if (typeof tc.index === 'number') {
                idx = tc.index;
            } else {
                // 無 index：帶 id 且與最後不同 → 新項，否則併入最後
                const last = this.items[this.items.length - 1];
                if (tc.id && (!last || last.id !== tc.id)) {
                    this.items.push({ id: tc.id, name: tc.function?.name, args: '' });
                    idx = this.items.length - 1;
                } else if (!last) {
                    this.items.push({ args: '' });
                    idx = 0;
                } else {
                    idx = this.items.length - 1;
                }
            }
            while (this.items.length <= idx) this.items.push({ args: '' });
            const slot = this.items[idx];
            if (tc.id && !slot.id) slot.id = tc.id;                    // 首個非空，不累加
            if (tc.function?.name && !slot.name) slot.name = tc.function.name;
            if (tc.function?.arguments) slot.args += tc.function.arguments; // 逐片拼接
        }
    }

    get size(): number {
        return this.items.length;
    }

    finalize(iteration: number): AccumulatedCall[] {
        return this.items.map((slot, i) => {
            const args = slot.args || '{}';
            let parseError = false;
            try { JSON.parse(args); } catch { parseError = true; }
            return {
                id: slot.id || `call_${iteration}_${i}`,
                type: 'function' as const,
                function: { name: slot.name || '', arguments: args },
                parseError,
            };
        });
    }
}
