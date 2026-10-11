// src/graph/kind.ts
import '@logseq/libs';
import type { GraphKind } from './types';
import { diag } from './diag';

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

interface ProbeResult {
    kind: GraphKind;
    // confident=false：capable 宿主上取得的全零判定，無法區分
    // 「DB 尚在載入（階段②）」與「真正的空圖」——不得寫入快取。
    confident: boolean;
}

/**
 * 2.0.2 實測（診斷時間軸，2026-10-11）：db worker 就緒分三段——
 * ①未初始化：查詢丟錯 db-worker-not-initialized（逃出，由 rag.ts 重試層接）；
 * ②worker 就緒但 DB 尚在載入：checkCurrentIsDbGraph 回 false 且 count 全零，
 *   不丟錯——這是「還不知道」，不是「file 圖」；
 * ③就緒：訊號可信。
 * supportDb 非 true 即判 file：舊宿主永不觸及新 API（R1 已實證）。
 */
async function probeDetailed(): Promise<ProbeResult> {
    const info = await logseq.App.getInfo().catch((e: unknown) => { throw tagged('getInfo', e); });
    if (info?.supportDb !== true) return { kind: 'file', confident: true };
    const isDb = await logseq.App.checkCurrentIsDbGraph().catch((e: unknown) => { throw tagged('checkCurrentIsDbGraph', e); });
    if (isDb) return { kind: 'db', confident: true };
    const [titleN, contentN] = await Promise.all([countAttr(':block/title'), countAttr(':block/content')]);
    if (titleN > 0 && contentN === 0) return { kind: 'db', confident: true };
    if (contentN > 0) return { kind: 'file', confident: true };
    return { kind: 'file', confident: false };
}

export async function probeGraphKind(): Promise<GraphKind> {
    const p = await probeDetailed();
    return p.kind;
}

export async function getGraphKind(): Promise<GraphKind> {
    const key = await getGraphCacheKey();
    if (cache && cache.graphKey === key) return cache.kind;
    const p = await probeDetailed();
    if (p.confident) cache = { graphKey: key, kind: p.kind };
    return p.kind;
}

const PATIENCE_TRIES = 6;
const PATIENCE_DELAY_MS = 500;

/**
 * 同步路徑專用（rag.ts fetchLogseqBlocks）：階段②的不確定判定退避重探，
 * 直至拿到正面證據或耗盡（耗盡後以 'file' 收斂——真空圖落 'empty'，無害且無 ❌）。
 * 階段①的丟錯不經此處，由 rag.ts 的 withWorkerRetry 接。
 * confident 結果一樣寫入快取；不確定結果絕不快取。
 */
export async function getPatientGraphKind(): Promise<GraphKind> {
    const key = await getGraphCacheKey();
    if (cache && cache.graphKey === key) return cache.kind;
    for (let attempt = 1; ; attempt++) {
        const p = await probeDetailed();
        if (p.confident) {
            cache = { graphKey: key, kind: p.kind };
            return p.kind;
        }
        if (attempt >= PATIENCE_TRIES) {
            diag('probe-giveup', `kind=${p.kind}（不確定收斂，未快取）`);
            return p.kind;
        }
        diag('probe-ambiguous', `attempt=${attempt}`);
        await new Promise((r) => setTimeout(r, PATIENCE_DELAY_MS));
    }
}

export function resetGraphKind(): void {
    cache = null;
}
