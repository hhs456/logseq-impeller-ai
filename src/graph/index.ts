// src/graph/index.ts
import { getGraphCacheKey, getGraphKind, resetGraphKind } from './kind';
import { FileGraphAdapter } from './file';
import { DbGraphAdapter } from './db';
import type { GraphAdapter, GraphKind } from './types';

// 夜版 N0–N17 全過才翻 true（回滾＝翻回 false；§4.10）
export const DB_ADAPTER_ENABLED = false;

interface AdapterCache {
    graphKey: string;
    adapter: GraphAdapter;
}

let adapterCache: AdapterCache | null = null;

/**
 * 依 kind 回傳當前圖譜的 adapter，以 graphKey 快取（切圖即重算）。
 * 注意（計畫決策 #1）：永不回傳 'unsupported' —— 旗標關時 DB 的
 * Editor-API 讀取（pageTree/blockTree，含 fullTitle 取字）必須照常，
 * 否則倒退於 Phase 0。datalog 三個表面由 isGraphUnsupported 在呼叫端閘住。
 */
export async function getAdapter(): Promise<GraphAdapter> {
    const key = await getGraphCacheKey();
    if (adapterCache && adapterCache.graphKey === key) return adapterCache.adapter;
    const kind = await getGraphKind();
    const adapter: GraphAdapter = kind === 'db' ? new DbGraphAdapter() : new FileGraphAdapter();
    adapterCache = { graphKey: key, adapter };
    return adapter;
}

// DB 圖譜且 adapter 未啟用＝本版本無法讀取 datalog。三個 datalog 表面
// （rag.ts 的 DB 分支＋tools.ts 兩個守衛）共引此謂詞，維持收攏點。
export async function isGraphUnsupported(kind?: GraphKind): Promise<boolean> {
    const k = kind ?? await getGraphKind();
    return k === 'db' && !DB_ADAPTER_ENABLED;
}

// 清 adapter 與 graphKind 快取（§4.4；由 rag.ts 的 onGraphSwitched 呼叫）
export function resetAdapter(): void {
    adapterCache = null;
    resetGraphKind();
}

// 只清 adapter 快取：kind 已被指紋覆核定論時，不得連同 kind 一起抹掉
export function invalidateAdapterCache(): void {
    adapterCache = null;
}
