// src/graph/kind.ts
import '@logseq/libs';
import type { GraphKind } from './types';

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
 * supportDb 非 true 即判 file：舊宿主（getInfo resolve 成 undefined 或缺欄位）
 * 永不觸及 checkCurrentIsDbGraph（R1 已實證）。
 */
export async function probeGraphKind(): Promise<GraphKind> {
    const info = await logseq.App.getInfo();
    if (info?.supportDb !== true) return 'file';
    return (await logseq.App.checkCurrentIsDbGraph()) ? 'db' : 'file';
}

export async function getGraphKind(): Promise<GraphKind> {
    const key = await getGraphCacheKey();
    if (cache && cache.graphKey === key) return cache.kind;
    const kind = await probeGraphKind();
    cache = { graphKey: key, kind };
    return kind;
}

export function resetGraphKind(): void {
    cache = null;
}
