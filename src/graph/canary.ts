// src/graph/canary.ts
import '@logseq/libs';

// 零結果時的 canary 閾值（可調）
export const CANARY_MIN = 20;

// 零結果時的 canary：只數「有頁面的區塊」總數，不取內容。
// 有大量區塊卻撈不到內容＝屬性名失效（schema 漂移），回 unsupported 而非靜默空圖。
// :block/page 在 file 與 DB schema 同存（S3），兩種 adapter 共用（計畫決策 #3）。
export async function countPageBlocksCanary(): Promise<number> {
    const out: any = await logseq.DB.datascriptQuery(
        `[:find (count ?b) . :where [?b :block/page _]]`
    );
    if (typeof out === 'number') return out;
    if (Array.isArray(out)) {
        const n = out.flat(Infinity).find((v: any) => typeof v === 'number');
        return typeof n === 'number' ? n : 0;
    }
    return 0;
}
