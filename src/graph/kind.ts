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

/**
 * 圖譜類型探測。不加 try/catch：探測失敗＝例外逃出，
 * 呼叫端（syncVectorDB / tools）讓它浮到各自的錯誤處理。
 * supportDb 非 true 即判 file：舊宿主（getInfo resolve 成 undefined 或缺欄位）
 * 永不觸及 checkCurrentIsDbGraph（R1 已實證）。
 *
 * 注意：此函數刻意保持「零額外查詢」——健康路徑不多付 IPC。
 * supportDb 可能不實（2.0.2 實測三轮時間軸：疑似未回 true，致 DB 圖恆判 file），
 * 該誤判由 fingerprintGraphKind() 在 schema-mismatch 異常時覆核，見下。
 */
export async function probeGraphKind(): Promise<GraphKind> {
    const info = await logseq.App.getInfo().catch((e: unknown) => { throw tagged('getInfo', e); });
    if (info?.supportDb !== true) return 'file';
    const isDb = await logseq.App.checkCurrentIsDbGraph().catch((e: unknown) => { throw tagged('checkCurrentIsDbGraph', e); });
    return isDb ? 'db' : 'file';
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
 * Schema 指紋覆核：只用 datascriptQuery（所有宿主皆有），故不受 supportDb 能力閘限制。
 * 回 'db'／'file'，或不確定時回 null（全零＝DB 尚在載入 與 真空圖 無法區分）。
 *
 * 呼叫時機**限定**在 file adapter 回報 schema-mismatch 之際：該狀態的定義就是
 * 「:block/page 有 >20 列，但 :block/content 一列都撈不到」——在真 file 圖上是屬性漂移，
 * 在 DB 圖上是分錯類（supportDb 能力閘未開）。同一訊號兩種成因，故在此覆核一次即可定論，
 * 健康路徑零額外成本。
 *
 * 歧義偏向：title 與 content 同時有列 → file。旗標關時誤判 db 會讓既有 100% file
 * 使用者吃到 GRAPH_TYPE_UNSUPPORTED（倒退於 Phase 0）；誤判 file 只讓新 DB 使用者
 * 吃到 schema-mismatch。保守側是 file。
 */
export async function fingerprintGraphKind(): Promise<GraphKind | null> {
    const [titleN, contentN] = await Promise.all([countAttr(':block/title'), countAttr(':block/content')]);
    diag('probe-fingerprint', `title=${titleN} content=${contentN}`);
    if (titleN > 0 && contentN === 0) return 'db';
    if (contentN > 0) return 'file';
    return null;
}

/**
 * 在 schema-mismatch 異常點上做指紋覆核，並把定論寫入快取（以當前圖為鍵）。
 * 回 null 表示不確定（全零）：快取維持原樣，讓本次同步以 schema-mismatch 收斂
 * ——它是可見的 warning 狀態、不是 ❌，且下一次同步會再覆核一次。
 */
export async function reclassifyByFingerprint(): Promise<GraphKind | null> {
    const kind = await fingerprintGraphKind();
    if (kind === null) return null;
    const key = await getGraphCacheKey();
    cache = { graphKey: key, kind };
    return kind;
}
