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

// 2.0.2 實測（N14）：Editor API 的 fullTitle 對連結保留 raw [[uuid]]，
// 不像 datalog 的 full-title（refs pull）會解析成可讀名。故以「被引用實體的
// uuid→title」map 做純字串取代——只用已實證的三個屬性，不新增未證屬性面。
const UUID = '[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}';
const PAGE_LINK_RE = new RegExp(`\\[\\[(${UUID})(\\|[^\\]]*)?\\]\\]`, 'g');
const BLOCK_REF_RE = new RegExp(`\\(\\((${UUID})\\)\\)`, 'g');

/** 把 [[uuid]]／(uuid) 取代為被引用實體的可讀名；查不到的原樣保留。 */
export function resolveBlockRefs(text: string, titles: Map<string, string>): string {
    if (!text || titles.size === 0) return text;
    return text
        .replace(PAGE_LINK_RE, (whole, uuid: string, label?: string) => {
            const t = titles.get(uuid.toLowerCase());
            return t ? `[[${t}${label ?? ''}]]` : whole;
        })
        .replace(BLOCK_REF_RE, (whole, uuid: string) => {
            const t = titles.get(uuid.toLowerCase());
            return t ? `((${t}))` : whole;
        });
}

/** 遞迴套用取代，回傳新樹（不改原樹）。 */
export function resolveNodeRefs(nodes: BlockNode[], titles: Map<string, string>): BlockNode[] {
    if (titles.size === 0) return nodes;
    return nodes.map((n) => ({
        ...n,
        text: resolveBlockRefs(n.text, titles),
        children: resolveNodeRefs(n.children, titles),
    }));
}
