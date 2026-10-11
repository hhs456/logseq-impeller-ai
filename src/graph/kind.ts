// src/graph/kind.ts
import '@logseq/libs';
import type { GraphKind } from './types';

// 探測失敗維持「不吞、讓它逃出」的設計；只在再拋時標上來源呼叫，
// 因為 2.0.2 實測宿主 rejection 是無訊息的純物件（夜版 N1 除錯用）。
function tagged(label: string, err: unknown): Error {
    const detail = err instanceof Error ? err.message
        : (() => { try { return JSON.stringify(err); } catch { return String(err); } })();
    return new Error(`${label} rejected: ${detail}`);
}

interface KindCache {
    graphKey: string;
    kind: GraphKind;
}

let cache: KindCache | null = null;

export async function getGraphCacheKey(): Promise<string> {
    const graph = await logseq.App.getCurrentGraph().catch((e: unknown) => { throw tagged('getCurrentGraph', e); });
    if (!graph) return 'unknown';
    return String((graph as any).url ?? (graph as any).path ?? 'unknown');
}

async function countAttr(attr: string): Promise<number> {
    const out: any = await logseq.DB.datascriptQuery(
        `[:find (count ?b) . :where [?b ${attr} _]]`
    );
    if (typeof out === 'number') return out;
    if (Array.isArray(out)) {
        const n = out.flat(Infinity).find((v: any) => typeof v === 'number');
        return typeof n === 'number' ? n : 0;
    }
    return 0;
}

/**
 * 圖譜類型探測。不加 try/catch：探測失敗＝例外逃出，
 * 呼叫端（syncVectorDB / tools）讓它浮到各自的錯誤處理。
 * supportDb 非 true 即判 file：舊宿主（getInfo resolve 成 undefined 或缺欄位）
 * 永不觸及 checkCurrentIsDbGraph（R1 已實證）。
 *
 * 2.0.2 實測（本 repo 診斷時間軸）：db worker 就緒前 checkCurrentIsDbGraph
 * 會回 false——那不是「file 圖」，是「還不知道」。因此 false 不直接採信，
 * 改用 schema 特徵覆核：:block/title 有列且 :block/content 無列 ⇒ 實為 DB 圖。
 * 覆核查詢若撞上 worker-not-ready 一律逃出，交給 rag.ts 的重試層。
 */
export async function probeGraphKind(): Promise<GraphKind> {
    const info = await logseq.App.getInfo().catch((e: unknown) => { throw tagged('getInfo', e); });
    if (info?.supportDb !== true) return 'file';
    const isDb = await logseq.App.checkCurrentIsDbGraph().catch((e: unknown) => { throw tagged('checkCurrentIsDbGraph', e); });
    if (isDb) return 'db';
    const [titleN, contentN] = await Promise.all([countAttr(':block/title'), countAttr(':block/content')]);
    if (titleN > 0 && contentN === 0) return 'db';
    return 'file';
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
