// src/graph/file.ts
// FileGraphAdapter：現行 file-graph 查詢與欄位解析的逐字搬移（計畫 §4.2）。
// 驗收：tests/file-graph-snapshot.test.ts 五鍵逐字比對 v0.10.1。
import '@logseq/libs';
import { escapeDsString } from '../utils/query';
import { slug, toBlockNode, toBlockNodes } from './text';
import { CANARY_MIN, countPageBlocksCanary } from './canary';
import type {
    BlockNode, FetchBlocksResult, GraphAdapter, GraphKind, IndexableBlock, KeywordHit, RefHit,
} from './types';

export class FileGraphAdapter implements GraphAdapter {
    readonly kind: GraphKind = 'file';

    // 不 catch：查詢拋錯就讓它逃出，落入 syncVectorDB 的外層 catch
    async fetchAllBlocks(): Promise<FetchBlocksResult> {
        const query = `
            [:find (pull ?b [:block/uuid :block/content {:block/page [:block/original-name :block/name]}])
             :where [?b :block/content ?c]
                    [(not= ?c "")]]
        `;
        const results = await logseq.DB.datascriptQuery(query);
        const blocks: IndexableBlock[] = (results ? results.flat() : []).map((block: any) => {
            const pageName = block.page?.['original-name'] || block.page?.name || "未命名頁面";
            return {
                id: block.uuid,
                content: block.content,
                pageName: pageName
            };
        });

        if (blocks.length > 0) return { status: 'ok', kind: this.kind, blocks };

        const canary = await countPageBlocksCanary();
        if (canary > CANARY_MIN) {
            return { status: 'unsupported', kind: this.kind, reason: 'schema-mismatch', detail: `canary=${canary}` };
        }
        return { status: 'empty', kind: this.kind };
    }

    async blocksReferencingPage(page: string): Promise<RefHit[]> {
        const lowerPageName = escapeDsString(slug(page));
        const linkedRefsQuery = `
            [:find (pull ?b [:block/content {:block/page [:block/original-name]}])
             :where [?p :block/name "${lowerPageName}"]
                    [?b :block/refs ?p]]
        `;
        const queryResults = await logseq.DB.datascriptQuery(linkedRefsQuery);
        const flatRefs = queryResults?.flat() || [];

        return flatRefs.map((b: any) => ({
            text: b.content,
            fromPage: b.page?.['original-name'] || "未知頁面",
        }));
    }

    async keywordSearch(keyword: string, limit: number): Promise<KeywordHit[]> {
        const escapedKeyword = escapeDsString(keyword);
        const query = `
            [:find (pull ?b [*])
             :where
             [?b :block/content ?c]
             [(clojure.string/includes? ?c "${escapedKeyword}")]]
        `;
        const results = await logseq.DB.datascriptQuery(query);
        if (!results || results.length === 0) return [];

        const hits: KeywordHit[] = [];
        for (const res of results.slice(0, limit)) {
            const block = res[0];
            const page = await logseq.Editor.getPage(block.page.id);
            const pageName = page ? page.name : "Unknown Page";
            hits.push({ uuid: block.uuid, pageTitle: pageName, text: block.content });
        }
        return hits;
    }

    async pageTree(pageNameOrUuid: string): Promise<BlockNode[] | null> {
        const blocks = await logseq.Editor.getPageBlocksTree(pageNameOrUuid);
        return toBlockNodes(blocks);
    }

    async blockTree(uuid: string): Promise<BlockNode | null> {
        const block = await logseq.Editor.getBlock(uuid, { includeChildren: true });
        if (!block) return null;
        return toBlockNode(block);
    }
}
