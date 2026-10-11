// src/graph/db.ts
// DbGraphAdapter：全走 datascriptQuery（計畫 §4.3）。
// 下列 datalog 皆 [未證：夜版 N9–N13 驗證]，欄位名來源 S3/S6。
// 硬約束：不自創屬性名排除 recycle 頁或 property-value 區塊——
// 是否加過濾以 N9/N20 的 count 對照為據，未驗證前原樣照計畫文字。
import '@logseq/libs';
import { escapeDsString } from '../utils/query';
import { blockText, resolveBlockRefs, resolveNodeRefs, slug, toBlockNode, toBlockNodes } from './text';
import { resolveFetchOutcome } from './canary';
import { diag } from './diag';
import type {
    BlockNode, FetchBlocksResult, GraphAdapter, GraphKind, IndexableBlock, KeywordHit, RefHit,
} from './types';

export class DbGraphAdapter implements GraphAdapter {
    readonly kind: GraphKind = 'db';

    // 不 catch：查詢拋錯就讓它逃出，落入 syncVectorDB 的外層 catch
    async fetchAllBlocks(): Promise<FetchBlocksResult> {
        // {:block/refs [...] 的 pull 讓 recur-replace-uuid-in-block-title 能解析 [[uuid]]（S6）
        const query = `
            [:find (pull ?b [:block/uuid :block/title
                             {:block/page [:block/title]}
                             {:block/refs [:block/uuid :block/title]}])
             :where [?b :block/page ?p]
                    [?b :block/title ?c]
                    [(not= ?c "")]]
        `;
        const results = await logseq.DB.datascriptQuery(query);
        const blocks: IndexableBlock[] = (results ? results.flat() : []).map((row: any) => ({
            id: row.uuid,
            content: blockText(row),
            pageName: row.page?.title ?? "未命名頁面",
        }));

        return resolveFetchOutcome(this.kind, blocks);
    }

    // 保留小寫 :block/name 做鍵；同名多頁全部納入（:block/name 在 DB 不再唯一）。
    // 計畫決策 #5：用插值而非 :in 參數化（:in 於 datascriptQuery 的行為 [未證]，
    // 插值是現行 file 版已上線的同一通道）；N10 驗證後可獨立換。
    async blocksReferencingPage(page: string): Promise<RefHit[]> {
        const lower = escapeDsString(slug(page));
        const query = `
            [:find (pull ?b [:block/title :block/uuid
                             {:block/page [:block/title]}
                             {:block/refs [:block/uuid :block/title]}])
             :where [?p :block/name "${lower}"]
                    (or [?b :block/refs ?p] [?b :block/tags ?p])
                    [(not= ?b ?p)]]
        `;
        const results = await logseq.DB.datascriptQuery(query);
        const rows = results?.flat() || [];

        // 被標記的頁面本身無 :block/page，fromPage 退回自身文字
        return rows.map((row: any) => ({
            text: blockText(row),
            fromPage: row.page?.title || blockText(row) || "未知頁面",
        }));
    }

    // 已知限制（§4.3）：比對 raw title，只靠頁面引用出現的文字會漏——
    // 夜版 N11 驗證後才決定是否加 or-join，未驗證前不先寫。
    // 頁名直接取 pull 的 page.title，去掉 file 版的 N+1 Editor.getPage。
    async keywordSearch(keyword: string, limit: number): Promise<KeywordHit[]> {
        const escapedKeyword = escapeDsString(keyword);
        const query = `
            [:find (pull ?b [:block/uuid :block/title {:block/page [:block/title]}])
             :where [?b :block/page ?p] [?b :block/title ?c]
                    [(clojure.string/includes? ?c "${escapedKeyword}")]]
        `;
        const results = await logseq.DB.datascriptQuery(query);
        if (!results || results.length === 0) return [];

        return results.slice(0, limit).map((res: any) => {
            const row = res[0];
            return {
                uuid: row.uuid,
                pageTitle: row.page?.title ?? "Unknown Page",
                text: blockText(row),
            };
        });
    }

    // Editor API 在 DB 同樣可用（Q2）；巢狀結構一致性已於 2.0.2 實測通過（N12：
    // 3 roots → 28 nodes，未壓平）。結構取自 Editor API，文字經 ref map 取代
    // 掉 raw [[uuid]]（N14 修復；取代失敗降級為原始文字，不拖垮整個 agent run）。
    async pageTree(pageNameOrUuid: string): Promise<BlockNode[] | null> {
        const blocks = await logseq.Editor.getPageBlocksTree(pageNameOrUuid);
        const nodes = toBlockNodes(blocks);
        if (!nodes) return null;
        return resolveNodeRefs(nodes, await this.refTitleMap());
    }

    // 不傳 includePage：DB 對頁面 uuid 回「找不到」是已知行為（N13 實測 null）。
    // 「此 uuid 是頁面」的區分文案由呼叫端（tools.ts）依 kind 處理（決策 #6）。
    async blockTree(uuid: string): Promise<BlockNode | null> {
        const block = await logseq.Editor.getBlock(uuid, { includeChildren: true });
        if (!block) return null;
        const node = toBlockNode(block);
        const [resolved] = resolveNodeRefs([node], await this.refTitleMap());
        return resolved;
    }

    /**
     * 被引用實體的 uuid→可讀名 map。只用今晚已實證的屬性
     * （:block/refs / :block/uuid / :block/title），故不需按頁綁定、
     * 也不必區分呼叫端傳的是頁名或頁 uuid。
     * 查詢失敗時降級為空 map（回原始 raw 文字）並留診斷記錄，
     * 不讓頁面上下文／大綱因一條美化的查詢而整個失敗。
     */
    private async refTitleMap(): Promise<Map<string, string>> {
        const map = new Map<string, string>();
        try {
            const rows = await logseq.DB.datascriptQuery(`
                [:find ?u ?t :where [?b :block/refs ?r] [?r :block/uuid ?u] [?r :block/title ?t]]
            `);
            for (const row of rows ?? []) {
                const [u, t] = row as [unknown, unknown];
                if (typeof u === 'string' && typeof t === 'string' && t) map.set(u.toLowerCase(), t);
            }
        } catch (err) {
            const detail = err instanceof Error ? err.message : (() => {
                try { return JSON.stringify(err); } catch { return String(err); }
            })();
            diag('ref-resolve-failed', detail.slice(0, 200));
        }
        return map;
    }
}
