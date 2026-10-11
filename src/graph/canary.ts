// src/graph/canary.ts
import '@logseq/libs';
import type { FetchBlocksResult, GraphKind, IndexableBlock } from './types';

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

// fetchAllBlocks 結尾的三態收攏點：ok / schema-mismatch / empty。
// 兩種 adapter 共引同一實作，比較子與 detail 格式只有一份（review finding 5）。
export async function resolveFetchOutcome(
    kind: GraphKind,
    blocks: IndexableBlock[],
): Promise<FetchBlocksResult> {
    if (blocks.length > 0) return { status: 'ok', kind, blocks };

    const canary = await countPageBlocksCanary();
    if (canary > CANARY_MIN) {
        return { status: 'unsupported', kind, reason: 'schema-mismatch', detail: `canary=${canary}` };
    }
    return { status: 'empty', kind };
}
