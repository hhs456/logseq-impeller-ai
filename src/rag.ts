// src/rag.ts
import '@logseq/libs';
import { pipeline, env } from '@huggingface/transformers';
import { create, insertMultiple, search } from '@orama/orama';
import { state } from './config'; // 💡 匯入 state 以使用 i18n 語系設定

let extractor: any = null;
let vectorDb: any = null;
let isSyncing = false; // 防抖鎖，避免同時觸發多次同步

// ==========================================
// 🚀 IndexedDB 快取系統：持久化保存向量資料
// ==========================================
const DB_NAME = 'ImpellerRAG_Cache';
const STORE_NAME = 'embeddings';

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function getCachedEmbedding(key: string): Promise<number[] | null> {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result ? req.result : null);
        req.onerror = () => resolve(null);
    });
}

async function saveCachedEmbeddings(entries: [string, number[]][]): Promise<void> {
    if (entries.length === 0) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        entries.forEach(([key, val]) => store.put(val, key));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// ==========================================
// 1. 資料抓取與過濾
// ==========================================
export async function fetchLogseqBlocks() {
    const query = `
        [:find (pull ?b [:block/uuid :block/content {:block/page [:block/original-name :block/name]}])
         :where [?b :block/content ?c]
                [(not= ?c "")]]
    `;
    try {
        const results = await logseq.DB.datascriptQuery(query);
        const blocks = results.flat()
            .filter((block: any) => block.content.includes('[[') || block.content.includes('#'))
            // 🎯 已經移除 .slice(0, 500)，正式解除封印，掃描全圖譜！
            .map((block: any) => {
                const pageName = block.page?.['original-name'] || block.page?.name || "未命名頁面";
                return {
                    id: block.uuid,
                    content: block.content,
                    pageName: pageName
                };
            });
        return blocks;
    } catch (error) {
        console.error("抓取 Logseq 資料失敗:", error);
        return [];
    }
}

// ==========================================
// 2. 智慧增量同步向量資料庫 (支援跨圖譜)
// ==========================================
export async function syncVectorDB() {
    if (isSyncing) return;
    isSyncing = true;
    
    try {
        const blocks = await fetchLogseqBlocks();
        if (blocks.length === 0) return;

        // 🎯 取得當前圖譜資訊，確保多個圖譜的資料在快取中不會互相污染
        const graph = await logseq.App.getCurrentGraph();
        const graphName = graph?.name || "default_graph";

        const processedBlocks = [];
        const blocksToVectorize = [];

        // 🎯 差異比對 (Diffing)：去 IndexedDB 查水表
        for (const block of blocks) {
            // 用圖譜名、UUID與內容組成絕對唯一的 Key。只要內容改了哪怕一個字，Key 就會變！
            const cacheKey = `${graphName}_${block.id}_${block.content}`;
            const cachedEmbedding = await getCachedEmbedding(cacheKey);

            if (cachedEmbedding) {
                // 命中快取！直接拿來用，完全不耗 CPU
                processedBlocks.push({ ...block, embedding: cachedEmbedding });
            } else {
                // 沒算過，或是被修改過了，排入待轉向量的隊列
                blocksToVectorize.push(block);
            }
        }

        // 🎯 如果有「新成員」，才需要驚動 AI 模型
        if (blocksToVectorize.length > 0) {
            if (!extractor) {
                env.allowLocalModels = false; 
                // 💡 使用 i18n 變數，並加上防呆預設值
                const msg = state.t.ragInitModel || "🧠 首次載入或更新模型中，需稍候 (約 90MB)...";
                logseq.UI.showMsg(msg, "info", { timeout: 8000 });
                extractor = await pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5');
            }

            // 💡 動態替換 {count} 變數
            const indexingMsg = (state.t.ragIndexing || "⏳ 發現 {count} 筆新筆記或修改，正在建立神經索引...").replace('{count}', blocksToVectorize.length.toString());
            logseq.UI.showMsg(indexingMsg, "info");
            
            const newEntries: [string, number[]][] = [];
            
            for (const block of blocksToVectorize) {
                const contextualText = `頁面名稱：【${block.pageName}】\n筆記內容：${block.content}`;
                const output = await extractor(contextualText, { pooling: 'mean', normalize: true });
                const embedding = Array.from(output.data) as number[];
                
                processedBlocks.push({ ...block, embedding });
                
                // 記錄進快取準備清單
                const cacheKey = `${graphName}_${block.id}_${block.content}`;
                newEntries.push([cacheKey, embedding]);
            }

            // 批次寫入快取，效能最高
            await saveCachedEmbeddings(newEntries);
            logseq.UI.showMsg(state.t.ragSyncDone || "✅ 增量更新完成！", "success");
        } else {
            // 如果全部命中快取，我們就在背景靜默完成，不打擾使用者
            console.log(`✅ ${processedBlocks.length} 筆筆記均命中本地快取，跳過模型推論。`);
        }

        // 🎯 最後，將最新的資料灌進 Orama 記憶體中供系統檢索 (此操作在毫秒級)
        vectorDb = await create({
            schema: { id: 'string', content: 'string', pageName: 'string', embedding: 'vector[512]' }
        });
        await insertMultiple(vectorDb, processedBlocks);

    } catch (err) {
        console.error("向量資料庫同步失敗:", err);
        // 💡 錯誤通知也加上 i18n 支援
        logseq.UI.showMsg(state.t.ragSyncFailed || "❌ 本地 AI 大腦啟動失敗", "error");
    } finally {
        isSyncing = false; // 解除鎖定
    }
}

// ==========================================
// 3. 工具介接：語意搜尋與圖譜搜尋
// ==========================================
export async function searchSimilarBlocks(queryText: string) {
    if (!vectorDb || !extractor) return [];
    try {
        const queryEmbedding = await extractor(queryText, { pooling: 'mean', normalize: true });
        const results = await search(vectorDb, {
            mode: 'vector',
            vector: { value: Array.from(queryEmbedding.data), property: 'embedding' },
            similarity: 0.3, 
            limit: 5, 
        });
        return results.hits.map(hit => ({
            id: hit.document.id,
            content: `(來自頁面 [[${hit.document.pageName}]]) ${hit.document.content}`
        }));
    } catch (err) {
        console.error("向量搜尋失敗:", err);
        return [];
    }
}

export async function getLinkedReferencesForPage(targetPage: string) {
    try {
        const lowerPageName = targetPage.toLowerCase().replace(/^#/, ''); 
        const linkedRefsQuery = `
            [:find (pull ?b [:block/content {:block/page [:block/original-name]}])
             :where [?p :block/name "${lowerPageName}"]
                    [?b :block/refs ?p]]
        `;
        const queryResults = await logseq.DB.datascriptQuery(linkedRefsQuery);
        const flatRefs = queryResults?.flat() || [];

        if (flatRefs.length === 0) {
            // 💡 傳給 AI 的參考上下文也可以加上 i18n，但這裡為了讓 AI 看懂，預設使用直白的敘述
            return (state.t.ragNoRefsFound || `知識庫中沒有找到與 [[{targetPage}]] 關聯的筆記。`).replace('{targetPage}', targetPage);
        }

        const resultString = flatRefs.map((b: any) => {
            const fromPage = b.page?.['original-name'] || "未知頁面";
            return `- [[${fromPage}]]: ${b.content}`;
        }).join("\n");

        const prefix = state.t.ragRefsFound || `以下是所有關聯到 [[{targetPage}]] 的筆記：\n`;
        return prefix.replace('{targetPage}', targetPage) + resultString;
    } catch (error) {
        console.error("圖譜查詢失敗:", error);
        return (state.t.ragQueryError || `查詢 [[{targetPage}]] 時發生錯誤。`).replace('{targetPage}', targetPage);
    }
}