// src/graph/kind.ts
import '@logseq/libs';
import type { GraphKind } from './types';

// Phase 0 固定 false；Phase 1 夜版 N0–N17 通過後翻 true（回滾＝翻回 false）
export const DB_ADAPTER_ENABLED = false;

interface KindCache {
    graphKey: string;
    kind: GraphKind;
}

let cache: KindCache | null = null;

export async function getGraphCacheKey(): Promise<string> {
    const graph = await logseq.App.getCurrentGraph();
    if (!graph) return 'unknown';
    return String((graph as any).url ?? (graph as any).path ?? 'unknown');
}

/**
 * 圖譜類型探測。不加 try/catch：探測失敗＝例外逃出，
 * 呼叫端（syncVectorDB / tools）讓它浮到各自的錯誤處理。
 */
export async function probeGraphKind(): Promise<GraphKind> {
    const info = await logseq.App.getInfo();
    if (info?.supportDb !== true) return 'file';
    return (await (logseq.App as any).checkCurrentIsDbGraph()) ? 'db' : 'file';
}

export async function getGraphKind(): Promise<GraphKind> {
    const key = await getGraphCacheKey();
    if (cache && cache.graphKey === key) return cache.kind;
    const kind = await probeGraphKind();
    cache = { graphKey: key, kind };
    return kind;
}

// DB 圖譜且 adapter 未啟用＝本版本無法讀取。rag.ts 與 tools.ts 共引此謂詞，
// 避免 Phase 1 翻旗標時兩端判定分歧。
export async function isGraphUnsupported(kind?: GraphKind): Promise<boolean> {
    const k = kind ?? await getGraphKind();
    return k === 'db' && !DB_ADAPTER_ENABLED;
}

export function resetGraphKind(): void {
    cache = null;
}
