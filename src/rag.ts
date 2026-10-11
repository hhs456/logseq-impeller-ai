// src/rag.ts
import '@logseq/libs';
import { pipeline, env } from '@huggingface/transformers';
import { create, insertMultiple, search } from '@orama/orama';
import { state } from './config';
import { logger } from './utils/logger';
import { getGraphKind, getGraphCacheKey, reclassifyByFingerprint } from './graph/kind';
import { getAdapter, isGraphUnsupported, resetAdapter, invalidateAdapterCache } from './graph';
import { diag, diagHistory, countDiag } from './graph/diag';
import { SIMILARITY_THRESHOLD } from './graph/types';
import type { FetchBlocksResult, IndexState, SearchOutcome } from './graph/types';

let extractor: any = null;
let vectorDb: any = null;
let indexState: IndexState = { status: 'idle' };
// 世代 token（§4.5，沿用 config.ts state.contextGen 的專案慣例）：
// 取代 isSyncing——多輪同步排隊序列化（同時只有一輪佔用 extractor），
// 過期輪在每個 await 邊界後丟棄，絕不寫回 vectorDb/indexState。
let syncGen = 0;
let syncChain: Promise<unknown> = Promise.resolve();
const noticedUnsupported = new Set<string>();

export function getIndexState(): IndexState {
    return indexState;
}

export function getSyncGen(): number {
    return syncGen;
}

// 圖譜切換的同步重置（§4.5①，handler 第一行）：先讓在飛世代的全部結果作廢，
// 立即清索引與狀態，再清 adapter/graphKind 快取（切圖＝重算）。
// 放最前以關閉「事件到 UI 隔離完成」之間舊索引仍可被查詢的窗口。
export function onGraphSwitched(): void {
    syncGen++;
    vectorDb = null;
    indexState = { status: 'idle' };
    resetAdapter();
    // N21：此計數＝onCurrentGraphChanged 實際觸發次數（同圖誤發事件也會被記）
    diag('graph-switch', `gen→${syncGen}`);
}

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
        tx.oncomplete = () => db.close();
    });
}

async function saveCachedEmbeddings(entries: [string, number[]][]): Promise<void> {
    if (entries.length === 0) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        entries.forEach(([key, val]) => store.put(val, key));
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

async function computeContentHash(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

// ==========================================
// 1. 資料抓取（經 GraphAdapter；schema 知識收斂在 src/graph/*）
// ==========================================

// 不 catch：查詢拋錯就讓它逃出，落入 syncVectorDB 的外層 catch
export async function fetchLogseqBlocks(): Promise<FetchBlocksResult> {
    const kind = await getGraphKind();
    if (await isGraphUnsupported(kind)) {
        diag('db-gated', 'DB_ADAPTER_ENABLED=false');
        return {
            status: 'unsupported',
            kind,
            reason: 'db-adapter-disabled',
            detail: 'DB_ADAPTER_ENABLED=false (Phase 0)',
        };
    }
    const adapter = await getAdapter();
    const res = await adapter.fetchAllBlocks();

    // file adapter 的 schema-mismatch ＝「:block/page 有 >20 列，但 :block/content 一列都撈不到」。
    // 兩種成因共用同一訊號：真屬性漂移，或 supportDb 能力閘未實（2.0.2 三轮實測：
    // 疑似 getInfo 未回 supportDb=true，致 DB 圖恆判 file）。指紋覆核一次即定論，
    // 健康路徑零額外查詢。覆核成功改判 db 則重走守衛路徑（旗標關＝db-adapter-disabled）。
    if (res.status === 'unsupported' && res.reason === 'schema-mismatch' && kind === 'file') {
        const fixed = await reclassifyByFingerprint();
        if (fixed === 'db') {
            invalidateAdapterCache();
            if (await isGraphUnsupported('db')) {
                diag('db-gated', 'reclassified-by-fingerprint');
                return {
                    status: 'unsupported',
                    kind: 'db',
                    reason: 'db-adapter-disabled',
                    detail: 'DB_ADAPTER_ENABLED=false (Phase 0)',
                };
            }
            return (await getAdapter()).fetchAllBlocks();
        }
    }
    return res;
}

// ==========================================
// 2. 智慧增量同步向量資料庫 (支援跨圖譜)
// ==========================================
async function ensureExtractor() {
    if (extractor) return extractor;
    env.allowLocalModels = false;
    // 💡 使用 i18n 變數，並加上防呆預設值
    const msg = state.t.ragInitModel || "🧠 首次載入或更新模型中，需稍候 (約 90MB)...";
    logseq.UI.showMsg(msg, "info", { timeout: 8000 });
    extractor = await pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5');
    return extractor;
}

// 宿主 api:call 的 rejection 不一定是 Error 實例（2.0.2 實測為純物件）——
// String(err) 只會產出 [object Object]，把負載丟光。故以 JSON 序列化兜底，
// 讓 diag('failed') 與 indexState.failed.message 帶得上可判讀的真實錯誤。
function describeErr(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'object' && err !== null) {
        try { return JSON.stringify(err); } catch { return Object.prototype.toString.call(err); }
    }
    return String(err);
}

// 2.0.2 實測：插件載入早於宿主 db worker 就緒，早期查詢回
// "db-worker has not been initialized"。這是暫時狀態，不是失敗——
// 退避重試並在每次重試前作廢探測快取（假 file 判定不得留存）。
const WORKER_NOT_READY = 'db-worker has not been initialized';

async function withWorkerRetry<T>(
    fn: () => Promise<T>,
    isStale: () => boolean,
    tries = 6,
    delayMs = 500,
): Promise<T | null> {
    for (let attempt = 1; ; attempt++) {
        try {
            return await fn();
        } catch (err) {
            if (!describeErr(err).includes(WORKER_NOT_READY)) throw err;
            if (attempt >= tries) throw err;
            diag('worker-retry', `attempt=${attempt}`);
            resetAdapter();
            await new Promise((r) => setTimeout(r, delayMs));
            if (isStale()) return null;
        }
    }
}

async function runSync(gen: number) {
    // 過期輪的每個 await 邊界都帶標籤記錄：N17 要能分辨「死在寫 vectorDb 之前（正確）」
    // 與「死在之後（bug）」。一回合一最多產生一筆 drop（命中即 return），無需去重。
    const stale = (where: string): boolean => {
        if (gen === syncGen) return false;
        diag('sync-drop', `gen=${gen} cur=${syncGen} at=${where}`);
        return true;
    };

    // 出隊先驗世代：過期輪不寫 building、不付全圖拉取（review finding 1）
    if (stale('entry')) return;
    indexState = { status: 'building', gen };
    diag('sync-start', `gen=${gen}`);

    try {
        const fetched = await withWorkerRetry(fetchLogseqBlocks, () => stale('workerRetry'));
        if (fetched === null) return;
        if (stale('fetch')) return;

        if (fetched.status === 'unsupported') {
            const noticeKey = `${await getGraphCacheKey()}|${fetched.reason}`;
            if (stale('noticeKey')) return;
            vectorDb = null;
            indexState = { status: 'unsupported', reason: fetched.reason };
            diag('fetch-unsupported', `gen=${gen} reason=${fetched.reason}`);
            if (!noticedUnsupported.has(noticeKey)) {
                noticedUnsupported.add(noticeKey);
                logseq.UI.showMsg(state.t.ragDbUnsupported, "warning", { timeout: 0 });
            }
            logger.info(`[RAG] 圖譜索引已停用：${fetched.reason} (${fetched.detail})`);
            return;
        }

        if (fetched.status === 'empty') {
            // 合法狀態：不彈窗，只記日誌
            vectorDb = null;
            indexState = { status: 'empty' };
            diag('fetch-empty', `gen=${gen} kind=${fetched.kind}`);
            logger.info("[RAG] 圖譜掃描完成，沒有可索引的非空區塊。");
            return;
        }

        const blocks = fetched.blocks;
        // N9/N20 的對照基準：這一輪到底撈到幾筆、後端是哪一種
        diag('fetch-ok', `gen=${gen} kind=${fetched.kind} blocks=${blocks.length}`);

        // 🎯 取得當前圖譜資訊，確保多個圖譜的資料在快取中不會互相污染
        const graph = await logseq.App.getCurrentGraph();
        if (stale('graphName')) return;
        const graphName = graph?.name || "default_graph";

        const processedBlocks = [];
        const blocksToVectorize = [];

        const allHashes = await Promise.all(blocks.map(b => computeContentHash(b.content)));
        if (stale('hashes')) return;
        const hashMap = new Map<string, string>();
        blocks.forEach((b, i) => hashMap.set(b.id, allHashes[i]));

        for (const block of blocks) {
            const contentHash = hashMap.get(block.id)!;
            const cacheKey = `${graphName}_${block.id}_${contentHash}`;
            const cachedEmbedding = await getCachedEmbedding(cacheKey);
            if (stale('cacheRead')) return;

            if (cachedEmbedding) {
                processedBlocks.push({ ...block, embedding: cachedEmbedding });
            } else {
                blocksToVectorize.push(block);
            }
        }
        diag('cache-diff', `gen=${gen} cached=${processedBlocks.length} cold=${blocksToVectorize.length}`);

        // 🎯 如果有「新成員」，才需要驚動 AI 模型
        if (blocksToVectorize.length > 0) {
            await ensureExtractor();
            if (stale('ensureExtractor')) return;

            // 💡 動態替換 {count} 變數
            const indexingMsg = (state.t.ragIndexing || "⏳ 發現 {count} 筆新筆記或修改，正在建立神經索引...").replace('{count}', blocksToVectorize.length.toString());
            logseq.UI.showMsg(indexingMsg, "info");

            const newEntries: [string, number[]][] = [];

            for (const block of blocksToVectorize) {
                const contextualText = `頁面名稱：【${block.pageName}】\n筆記內容：${block.content}`;
                const output = await extractor(contextualText, { pooling: 'mean', normalize: true });
                if (stale('embed')) return;
                const embedding = Array.from(output.data) as number[];

                processedBlocks.push({ ...block, embedding });

                // 記錄進快取準備清單
                const cacheKey = `${graphName}_${block.id}_${hashMap.get(block.id)!}`;
                newEntries.push([cacheKey, embedding]);
            }

            // 批次寫入快取，效能最高
            await saveCachedEmbeddings(newEntries);
            if (stale('saveCache')) return;
            logseq.UI.showMsg(state.t.ragSyncDone || "✅ 增量更新完成！", "success");
        } else {
            // 如果全部命中快取，我們就在背景靜默完成，不打擾使用者
            logger.info(`✅ ${processedBlocks.length} 筆筆記均命中本地快取，跳過模型推論。`);
        }

        // 🎯 最後，將最新的資料灌進 Orama 記憶體中供系統檢索 (此操作在毫秒級)
        // 世代檢查必须在寫 vectorDb 之前：過期輪（如 A 圖遲到）絕不得佔用當前索引（N17）
        const db = await create({
            schema: { id: 'string', content: 'string', pageName: 'string', embedding: 'vector[512]' }
        });
        await insertMultiple(db, processedBlocks);
        if (stale('buildIndex')) return;
        vectorDb = db;
        indexState = { status: 'ready', blockCount: processedBlocks.length, builtAt: Date.now() };
        // N9：blockCount 是唯一能跟 Logseq UI 數量對照的數字，務必可見
        diag('ready', `gen=${gen} blockCount=${processedBlocks.length} graph=${graphName}`);

    } catch (err) {
        if (stale('catch')) return; // 過期輪的例外不污染新輪狀態、不彈錯
        vectorDb = null; // 不殘留舊圖索引
        const message = describeErr(err);
        indexState = { status: 'failed', message };
        diag('failed', `gen=${gen} ${message}`);
        logger.error("向量資料庫同步失敗:", err);
        logseq.UI.showMsg(state.t.ragSyncFailed || "❌ 本地 AI 大腦啟動失敗", "error");
    }
}

// 取代 isSyncing：排隊而非丟棄——同時只有一輪佔用 extractor；
// 每輪帶世代 token，過期結果在各 await 邊界丟棄。
export function syncVectorDB(): Promise<unknown> {
    const gen = ++syncGen;
    diag('sync-enqueue', `gen=${gen}`);
    const p = syncChain.then(() => runSync(gen));
    syncChain = p.catch(() => undefined); // 序列化鏈不因單輪失敗而斷
    return p;
}

// ==========================================
// 3. 工具介接：語意搜尋與圖譜搜尋
// ==========================================
type UnavailableReason = Extract<SearchOutcome, { status: 'unavailable' }>['reason'];

function unavailableReasonFromIndexState(s: IndexState): UnavailableReason {
    switch (s.status) {
        case 'building': return 'building';
        case 'empty': return 'empty-graph';
        case 'unsupported': return 'unsupported';
        case 'failed': return 'failed';
        default: return 'idle';
    }
}

export async function searchSimilarBlocks(queryText: string): Promise<SearchOutcome> {
    if (!vectorDb) {
        return { status: 'unavailable', reason: unavailableReasonFromIndexState(indexState) };
    }
    try {
        // 修 F：暖快取啟動時 extractor 可能是 null，lazy 載入而非回空
        if (!extractor) await ensureExtractor();
        const queryEmbedding = await extractor(queryText, { pooling: 'mean', normalize: true });
        const results = await search(vectorDb, {
            mode: 'vector',
            vector: { value: Array.from(queryEmbedding.data), property: 'embedding' },
            similarity: SIMILARITY_THRESHOLD, 
            limit: 5, 
        });
        return { status: 'ok', hits: results.hits.map((hit: any) => ({
            id: hit.document.id,
            content: `(來自頁面 [[${hit.document.pageName}]]) ${hit.document.content}`
        })) };
    } catch (err) {
        logger.error("向量搜尋失敗:", err);
        return { status: 'unavailable', reason: 'search-error' };
    }
}

export async function getLinkedReferencesForPage(targetPage: string) {
    try {
        const adapter = await getAdapter();
        const refs = await adapter.blocksReferencingPage(targetPage);

        if (refs.length === 0) {
            // 💡 傳給 AI 的參考上下文也可以加上 i18n，但這裡為了讓 AI 看懂，預設使用直白的敘述
            return (state.t.ragNoRefsFound || `知識庫中沒有找到與 [[{targetPage}]] 關聯的筆記。`).replace('{targetPage}', targetPage);
        }

        const resultString = refs.map((r) => {
            return `- [[${r.fromPage}]]: ${r.text}`;
        }).join("\n");

        const prefix = state.t.ragRefsFound || `以下是所有關聯到 [[{targetPage}]] 的筆記：\n`;
        return prefix.replace('{targetPage}', targetPage) + resultString;
    } catch (error) {
        logger.error("圖譜查詢失敗:", error);
        return (state.t.ragQueryError || `查詢 [[{targetPage}]] 時發生錯誤。`).replace('{targetPage}', targetPage);
    }
}

// ==========================================
// 4. 夜版實測診斷（計畫 §7 N9/N17/N20/N21）
//    logger.info/warn 在 production build 被拔掉，故另建此外露通道。
// ==========================================
function describeIndexState(s: IndexState): string {
    switch (s.status) {
        case 'ready': return `ready blockCount=${s.blockCount}`;
        case 'building': return `building gen=${s.gen}`;
        case 'unsupported': return `unsupported reason=${s.reason}`;
        case 'failed': return `failed: ${s.message}`;
        case 'empty': return 'empty';
        default: return 'idle';
    }
}

// 一行摘要：showMsg 用（Logseq toast 不保留換行，長报告会糊）
export function getRagDiagSummary(): string {
    return `RAG ${describeIndexState(indexState)} · gen=${syncGen}`
        + ` · switches=${countDiag('graph-switch')} · drops=${countDiag('sync-drop')}`;
}

// 全量時間軸：logger.error 用（error 是 prod 唯一抵達使用者的 log 層）
export function getRagDiagReport(): string {
    const lines = diagHistory().map(
        (e) => `${String(e.ms).padStart(7)}ms  ${e.event}${e.detail ? `  | ${e.detail}` : ''}`
    );
    return [`[Impeller RAG diag] ${describeIndexState(indexState)} · gen=${syncGen}`, ...lines].join('\n');
}

// DevTools 需先把 context 切到本插件的 iframe（Logseq 外掛跑在 iframe 內）再呼叫，
// 用於需要原始 payload 的情境（例：N19 想交叉比對 txData）。
(globalThis as any).__impellerDiag = () => ({
    state: indexState,
    gen: syncGen,
    summary: getRagDiagSummary(),
    history: diagHistory().slice(),
});