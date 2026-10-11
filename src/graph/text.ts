// src/graph/text.ts
// 純函式：文字取用與顯示名（計畫 §4.1 修 G/H/I、§4.7）
import type { BlockNode, GraphKind } from './types';

/**
 * 統一文字存取，覆蓋四種形狀（修 G：缺值不再靜默變空；修 I：DB 優先用可讀 full-title）：
 * BlockNode（adapter 間傳遞）→ Editor API DB 實體（camelCase fullTitle）
 * → datascriptQuery 輸出（kebab full-title）→ file 實體（content）→ DB raw title
 */
export function blockText(b: any): string {
    return b?.text ?? b?.fullTitle ?? b?.['full-title'] ?? b?.content ?? b?.title ?? '';
}

/** 顯示頁名（修 H）：file 用 originalName；DB 無 originalName，用 title */
export function pageDisplayName(p: any, kind: GraphKind): string {
    if (kind === 'db') return p?.title || p?.originalName || p?.name || '';
    return p?.originalName || p?.name || '';
}

/** :block/name 比對鍵：兩種後端都需小寫（§4.7），不條件化 */
export function slug(pageName: string): string {
    return pageName.toLowerCase().replace(/^#/, '');
}

export function toBlockNode(b: any): BlockNode {
    return {
        uuid: b.uuid,
        text: blockText(b),
        children: b.children ? b.children.map(toBlockNode) : [],
    };
}

export function toBlockNodes(list: any): BlockNode[] | null {
    if (!list) return null;
    return list.map(toBlockNode);
}
