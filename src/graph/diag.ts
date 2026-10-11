// src/graph/diag.ts
// 夜版實測（計畫 §7 N0–N21）用的同步診斷環形緩衝。
// 存在理由：logger.info/warn 在 production build 被 import.meta.env.DEV 拔掉，
// 而 N9 需要 blockCount、N17 需要「A 輪死在哪個 await 邊界」、N21 需要切圖事件次數——
// 這三項若無外露訊號，在真實 DB 夜版上只能靠猜。
// 消費端：main.ts 的 command palette 指令（showMsg 摘要 ＋ logger.error 全量，
// error 是 prod 唯一抵達使用者的 log 層）與 globalThis.__impellerDiag()。
export interface DiagEntry {
    ms: number;
    event: string;
    detail?: string;
}

const MAX_ENTRIES = 80;
const history: DiagEntry[] = [];
let t0 = 0;

export function diag(event: string, detail?: string): void {
    if (!t0) t0 = performance.now();
    history.push({ ms: Math.round(performance.now() - t0), event, detail });
    if (history.length > MAX_ENTRIES) history.splice(0, history.length - MAX_ENTRIES);
}

export function diagHistory(): readonly DiagEntry[] {
    return history;
}

export function countDiag(prefix: string): number {
    return history.filter((e) => e.event.startsWith(prefix)).length;
}

export function clearDiag(): void {
    history.length = 0;
    t0 = 0;
}
