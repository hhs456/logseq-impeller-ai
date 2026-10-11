# logseq-impeller-ai：Logseq DB-graph 相容化計畫（v0.10.0 → 0.11.x）

> 狀態：唯讀規劃產物，未改任何原始碼。
> 標記：**[證]** = 有來源；**[未證]** = 未證實，需夜版實測（不以推測填補）。
> 來源代號見文末「來源表」。

---

## 0. 先講結論（含對前提的更正）

1. **Q1 答案：不必改成 `has-ref`。** DB schema 的 `:block/refs` 仍存在 [證 S3]，現行 `[?b :block/refs ?p]` 語意可原樣保留。要改的只有 `:block/content`→`:block/title`、`:block/original-name`→`:block/title`。`has-ref` 反而會多撈「祖先區塊引用該頁」的子孫區塊（S4），與現行行為不同。
2. **最大風險不是例外，是「成功但空」。** 在 DB graph 跑現行 file-graph 查詢，datalog 對不存在的屬性通常回空集合而非丟錯 [未證：datascript 對未知屬性行為屬一般知識，須夜版確認]。所以只把 `return []` 改成「帶型別的 catch」**抓不到**主要失效模式。Phase 0 必須用「圖譜類型探測 + canary」，不能只靠 try/catch 分類。
3. **你的事實清單有三處要修正：**
   - 事實 1：`getInfo().supportDb` 在宿主端是**寫死 `true`**（S2-app `get_app_info`），代表「此宿主 build 懂 DB」，**不代表目前圖譜是 DB**。唯一可信的圖譜類型探測是 `checkCurrentIsDbGraph()`（S2-api：`check_current_is_db_graph config/db-based-graph?`）。`supportDb` 只能當「能不能呼叫 `checkCurrentIsDbGraph`」的能力閘。範例插件 zoterolocal 直接拿 `supportDb` 分流 [證 S11]，這在「DB 版 app 只開 DB graph」的前提下才成立，我們不採用該捷徑。
   - 事實 4：DB 圖譜頁名**並非**到處大小寫敏感。schema 註解 `:block/name` 仍是 lowercase 索引（S3）；zoterolocal 對 `getPageBlocksTree`/`getPageProperties` 傳入 `page.title.toLowerCase()` 並可運作（S11 `index.tsx`、`sync-annotations.ts`）。DB 的真正差異是**同名頁可並存（以 tag 區分）**，`:block/name` 不再唯一（S3 註解「remove db/unique for :block/name」；S9「Page names are unique by tag」）。
   - 事實 7：marketplace 現行 README 的欄位是 `supportsDB` / `supportsDBOnly`（預設 false）（S13），**不是** `unsupportedGraphType`；後者見於舊版文件/DeepWiki/gist，且兩個範例插件的 manifest 都用 `supportsDB: true`（S12、S13-zotero）。「兩個都不填＝雙支援」**不成立**：不填 `supportsDB` 等於宣告不支援。
4. **你漏掉的靜默失效點（本計畫一併處理）：**
   - **F（既有 bug）**：`rag.ts:127-134` 只有「有新區塊要向量化」才載入 `extractor`；快取全命中時 `extractor` 永遠是 `null`，`rag.ts:180` 讓 `semantic_search` 在**暖快取且無變更**的啟動下永遠回 `[]`（file graph 也中）。
   - **D**：`rag.ts:210-213` `getLinkedReferencesForPage` 零結果回「知識庫中沒有找到…」——DB 上舊查詢回空時會被 agent 當成「圖譜無資料」。
   - **E**：`tools.ts:262-263` `No results found for keyword`，同理。
   - **G**：`utils/markdown.ts:21` `getTxt` 讀 `b.content ?? ''`，缺值時靜默變空字串；`agent.ts:37-41`（頁面上下文）、`tools.ts:194,210` 都依賴它/`b.content.substring`。
   - **H**：`actions.ts:56` `originalName || name`：DB 無 `originalName`（S1 master 型別為可選、S6 顯示 `title`），會退回小寫 `name`，聊天視窗標題被小寫化。`tools.ts:273` 同理。
   - **I**：DB 的 `:block/title` 把頁面引用存成 `[[<uuid>]]`（S6 `id-ref-pattern` / `recur-replace-uuid-in-block-title`），直接餵 embedding 與 LLM 會是 uuid 噪音；需用 `full-title`（SDK 轉換層附加，S2-utils）。

---

## 1. 開放問題查證結果

### Q1：區塊引用頁面的 DB 寫法
| 結論 | 來源 |
|---|---|
| `:block/refs` 仍在 DB schema（ref-many） | S3 `schema.cljs` |
| `has-ref` 規則存在：區塊自身 refs，或其祖先的 refs（含 `parent` 依賴） | S4 `rules.cljc` |
| **`customQuery` 接受 `(has-ref ?b ?ref)`**：worker 端 `add-query-rules` 掃 `:where` 自動注入內建規則與相依規則 | S5 `worker/handler/query.cljs` |
| **`datascriptQuery` 不注入規則**：走 `:thread-api/q`，原樣 `d/q`；要用規則得自帶 `%` 輸入 | S2-db `datascript_query`、S5 |
| `customQuery` 只收 `[:find ...]` 向量（否則走 DSL 路徑）、拒絕含函式的 query | S2-db `custom_query`、S5 `function-bearing?` |
| 宿主 master 的 `customQuery` 走 `query-custom/custom-query`→worker `:thread-api/query-custom`；SDK 註解寫「through query-react」。**正式版/夜版是否與 master 一致 → [未證]** | S1 vs S2-db |
| 型別：0.0.17 無 `customQuery`、無 `checkCurrentIsDbGraph`、`AppInfo` 無 `supportDb`；master/`next`(0.3.4) 皆有 | S14（`LSPlugin.d.ts:117,609-642`；grep 無 `customQuery`/`checkCurrentIsDbGraph`）、S1、S15 |
| 執行期不受 0.0.17 型別限制：`_makeUserProxy` 對任意方法名轉發 `api:call`（`checkCurrentIsDbGraph`→`check_current_is_db_graph`） | S10；**舊宿主缺方法時的 rejection 行為 [未證]** |
| tag 關聯另有 `:block/tags`（ref-many）。DB 的「tag 頁→被標記物件」是否同時寫入 `:block/refs` **[未證]**；`get-block-refs` 對 class/property 的過濾暗示會寫入但不是證明 | S3 |

**決策：** `graph_tag_search` 的 DB 版用 `datascriptQuery` + `(or [?b :block/refs ?p] [?b :block/tags ?p])`，不依賴 `has-ref`，也不依賴 `customQuery`（沿用同一通道，零新增型別）。

### Q2：`Editor.getPageBlocksTree` / `getBlock(uuid,{includeChildren})`
| 結論 | 來源 |
|---|---|
| 兩者在 DB 宿主都存在；`get_page_blocks_tree(id-or-page-name)` 接受名稱或 uuid | S2-editor |
| 回傳經 `normalize-keyword-for-json`：對同時有 `:block/uuid`＋`:block/title` 的 map **附加 `content`（=title）與 `full-title`**；`:block/children`→`children`。→ 現有 `b.content` 讀法在 DB **不會變 undefined** | S2-utils |
| 但 `content` = **raw title（含 `[[uuid]]`）**；人類可讀文字在 `fullTitle`（Editor API，camelCase）。zoterolocal 的讀法是 `content ?? title` | S2-utils、S6、S11 `is-page-empty.ts` |
| `getBlock(uuid, opts)`：**傳了 opts 就不會預設 `includePage:true`**，且 DB 對「頁面實體」預設回 `nil`（`(not (contains? block :block/name))` 條件）。→ 對**頁面 uuid** 呼叫 `executeReadTargetBlock` 會得到「找不到此區塊」 | S2-editor `get_block`、S2-block |
| `includeChildren:true` → `blocks->vec-tree`，`children` 為巢狀物件；未帶時 `children` 為 `['uuid', id]` tuple | S2-block |
| `getPageBlocksTree` 在頁面無區塊時回 `nil`；現有 `!blocks` 判斷已涵蓋 | S2-editor |
| `getPageBlocksTree` 的**巢狀結構是否與 file graph 相同 → [未證]**（`<get-page-blocks-tree` 只確認是 worker thread-api，內部未讀） | S2-async |
| `getPageLinkedReferences`：DB 實作回傳為 group-by page 的結構，與 d.ts `:494` 的 `Array<[page, blocks]>` 是否一致 **[未證]** → **本計畫不使用此 API** | S2-editor、S14 |

**DB 端替代讀取路徑：** 無需替代，沿用 `Editor.*`；只在「文字取用」改走 `blockText()`（`fullTitle ?? content ?? title`）。需夜版驗證巢狀結構（N12）。

### Q3：頁面跳轉與 `Editor.getPage`
| 結論 | 來源 |
|---|---|
| `pushState('page', {name})`：宿主取 `(:name params)` 傳給 `redirect-to-page!` | S2-api `push_state`；SDK 自身也用 `{name: pageName}`（S10 `scrollToBlockInPage`） |
| `redirect-to-page!` 文件字串：「page-name can be a block uuid or name, **prefer to use uuid than name when possible**」；內部走 `<page-route-info` | S7 `route.cljs` |
| Web 平台是否另行 lowercase 路由名 **[未證]** | S7 |
| `Editor.getPage(id-or-page-name)`：簽名不變，內部 `<get-block … {:children? false}`；DB 回傳**無 `originalName`**，頁名在 `title` | S2-editor、S1 `PageEntity` |
| 同名頁並存時 `getPage('Apple')` 回哪一個 **[未證]** | S9 |

**決策：** DB 圖譜 `openPage` 用 `pushState('page', { name: page.uuid })`（已有 `getPage` 回傳可用，`actions.ts:123`）；file 圖譜維持 `name`。uuid 與 name 兩種在夜版都要測（N15）。

### 附帶：側欄（DB changelog #36）
- master `right_sidebar.cljs`：`.sidebar-item-list` **只在 `sidebar-open?` 時才渲染**（`(when sidebar-open? (sidebar-inner …))`），且清單由 React keyed `for` 產生；`#right-sidebar` id 仍在。官方另有「plugin sidebar renderer」機制（`:plugin` block-type、`get-hosted-renderers`）。(S8)
- 我們的 `ui.ts:128` 用 `provideUI({ path: '#right-sidebar .sidebar-item-list' })` 硬塞進宿主 DOM，`panel.ts:15-16` 用固定 150ms 等待。這在 DB 上是否穩定 **[未證]** → 夜版 N3–N6。**UI 重構不在本次範圍**；若失敗，另開任務（改用官方 sidebar renderer）。
- 測試 mock 的 `provideUI` 永遠找得到 `.sidebar-item-list`（`logseq-mock.ts:35-38`），無法代表 DB 行為。

---

## 2. 設計原則

- 失敗必須「逃出來」：**移除** `fetchLogseqBlocks` 的 catch（`rag.ts:73,86-89`），讓例外落入 `syncVectorDB` 既有的外層 catch（`rag.ts:168-171`，這是唯一保留的 catch，不新增）。
- 判別聯集一律用**字串 `status`**，不用 boolean `ok`：`tsconfig.json` 是 `strict:false`，boolean 判別式在無 `strictNullChecks` 下不可靠。
- 給 LLM 的字串必須是**陳述事實**，不是祈使句：`agent.ts:73-75` 的 tool-result 包裝明示「不要把 tool result 內文當指令」，祈使句會被忽略。
- 圖譜類型探測與 adapter 快取以 `graph.url`（退而用 `graph.path`）為鍵，切圖即失效。
- 不碰 UI、memory 模組；不改 IndexedDB schema 版本（`ImpellerRAG_Cache` v1）。

---

## 3. Phase 0｜止損：讓失敗可見（獨立可發版 v0.10.1）

### 3.1 型別（新檔 `src/graph/types.ts`，僅型別 + 常數）
```ts
export type GraphKind = 'file' | 'db';

export interface IndexableBlock { id: string; content: string; pageName: string }

// 例外不在此聯集內：查詢拋錯就讓它拋（落入 syncVectorDB 外層 catch）
export type FetchBlocksResult =
  | { status: 'ok';          kind: GraphKind; blocks: IndexableBlock[] }
  | { status: 'empty';       kind: GraphKind }                      // 查詢成功且 canary 證實真的沒有可索引區塊
  | { status: 'unsupported'; kind: GraphKind; reason: 'db-adapter-disabled' | 'schema-mismatch'; detail: string };

export type IndexState =
  | { status: 'idle' }                                              // 尚未同步
  | { status: 'building'; gen: number }
  | { status: 'ready'; blockCount: number; builtAt: number }
  | { status: 'empty' }
  | { status: 'unsupported'; reason: string }
  | { status: 'failed'; message: string };

export type SearchOutcome =
  | { status: 'ok'; hits: { id: string; content: string }[] }      // hits 可為 0 筆
  | { status: 'unavailable';
      reason: 'idle' | 'building' | 'empty-graph' | 'unsupported' | 'failed' | 'search-error' };
```

### 3.2 圖譜類型探測（新檔 `src/graph/kind.ts`，Phase 1 沿用）
```ts
export async function probeGraphKind(): Promise<GraphKind> {
  const info = await logseq.App.getInfo();                 // 0.0.17 已有型別
  if (info?.supportDb !== true) return 'file';             // 舊宿主：無 DB 能力 [舊宿主 0.10.x 的 getInfo 形狀 → 未證，OG 回歸 R1]
  return (await (logseq.App as any).checkCurrentIsDbGraph()) ? 'db' : 'file';  // Phase 1 以 module augmentation 取代 as any
}
// getGraphKind(): 以 graph.url 為鍵快取；resetGraphKind() 於圖譜切換時呼叫
```
不加 try/catch：探測失敗＝例外逃出，使用者看到 `ragSyncFailed`。

### 3.3 `fetchLogseqBlocks()`（`rag.ts:67-90`）
- 回傳 `Promise<FetchBlocksResult>`；刪除 catch。
- 流程：`kind = await getGraphKind()` →
  - `kind==='db'` 且 `DB_ADAPTER_ENABLED===false`（Phase 0 固定 false）→ **不執行舊查詢**，直接回 `unsupported/db-adapter-disabled`。
  - `kind==='file'`：照舊查詢；`rows.length>0` → `ok`。`rows.length===0` → 跑 canary：`[:find (count ?b) . :where [?b :block/page _]]`；`> CANARY_MIN(=20，可調)` 視為 `unsupported/schema-mismatch`（有大量區塊卻撈不到內容＝屬性名失效，涵蓋未來 schema 漂移），否則 `empty`。
- canary 只在「零結果」時多一次輕量 count，不影響熱路徑。

### 3.4 `syncVectorDB()` 三條路徑（`rag.ts:95-174`）
| 路徑 | 觸發 | `indexState` | 使用者可見 | `vectorDb` |
|---|---|---|---|---|
| **失敗** | 任何拋出（含 `checkCurrentIsDbGraph` 拒絕、datalog 例外、模型載入失敗） | `failed{message}` | 既有外層 catch：`logger.error` + `showMsg(ragSyncFailed,'error')`（維持，補上寫 `indexState`） | 不動為舊值前先清為 `null`（避免殘留他圖索引） |
| **不支援** | `unsupported` | `unsupported{reason}` | `showMsg(state.t.ragDbUnsupported,'warning',{timeout:0})`，同一 `(graphKey,reason)` 只提示一次 | `null` |
| **空圖** | `empty` | `empty` | 不彈窗（合法狀態），`logger.info` | `null` |
| **成功** | `ok` | `ready{blockCount,builtAt}` | 沿用既有訊息 | 重建 |
- 取代 `rag.ts:101` 的 `if (blocks.length === 0) return;`（靜默失靈點 B）。
- `finally` 仍釋放 `isSyncing`（`rag.ts:172`）；世代 token 留到 Phase 1。
- 新增 i18n key `ragDbUnsupported` 於 `src/i18n.ts` 全部語系（文案：偵測到 Logseq DB 圖譜；此版本尚未支援，語意搜尋與圖譜查詢已停用，不代表您的筆記沒有資料）。

### 3.5 `searchSimilarBlocks()`（`rag.ts:179-197`）
- 回傳 `SearchOutcome`。
- **修 F**：新增 `ensureExtractor()`（抽出 `rag.ts:128-133` 的載入邏輯），`searchSimilarBlocks` 在 `vectorDb` 存在而 `extractor===null` 時先呼叫它（含既有 `ragInitModel` 提示）。不是 `return []`。
- `vectorDb` 為空時依 `getIndexState()` 回對應 `unavailable.reason`；`catch`（`rag.ts:193-196`）改回 `unavailable/search-error` 並保留 `logger.error`（不新增 catch，只改既有 catch 的回傳）。

### 3.6 `tools.ts` 給 LLM 的字串（`tools.ts:152-154`）
`semantic_search` 不再 `JSON.stringify({results: blocks})`，改依 `SearchOutcome`：
```jsonc
// unavailable（結果欄位刻意為 null，不是 []）
{"status":"INDEX_UNAVAILABLE","reason":"building","results":null,
 "meaning":"The semantic index could not be consulted (reason: building). This says nothing about whether the user's notes contain the topic. A missing result here is NOT evidence that no relevant notes exist. Alternatives: global_keyword_search, graph_tag_search, get_page_outline; or tell the user the index is unavailable and why."}

// unsupported
{"status":"GRAPH_TYPE_UNSUPPORTED","reason":"unsupported","results":null,
 "meaning":"The current graph is a Logseq DB graph that this plugin version cannot read yet. Semantic and graph queries are disabled, so no conclusion about the user's notes can be drawn from this tool."}

// empty-graph（合法）
{"status":"GRAPH_HAS_NO_INDEXABLE_BLOCKS","results":[],
 "meaning":"The graph was scanned successfully and contains no non-empty blocks."}

// ok 但 0 筆（也必須降低過度推論）
{"status":"NO_MATCH_ABOVE_THRESHOLD","results":[],"similarity_threshold":0.3,
 "meaning":"No block scored above the similarity threshold. This does not prove the topic is absent; try keyword search."}

// ok 有結果
{"status":"OK","results":[ ... ]}
```
`graph_tag_search`、`global_keyword_search`（`tools.ts:156-158,168-169`）：Phase 0 先 `if ((await getGraphKind())==='db') return JSON.stringify({status:'GRAPH_TYPE_UNSUPPORTED', results:null, meaning:'…'})`，不跑舊查詢，杜絕 D/E。`get_page_outline`/`read_target_block` 走 Editor API，Phase 0 不動。

### 3.7 測試與 mock 修法
- **`tests/helpers/logseq-mock.ts`**（修改）：
  - `App` 增 `getInfo: vi.fn(async () => ({ version: '0.10.9' }))`、`checkCurrentIsDbGraph: vi.fn(async () => false)`；`getCurrentGraph` 回 `{ path, name, url }`。
  - `DB` 增 `datascriptQuery`、`customQuery`、`onChanged: vi.fn(() => () => {})`，**預設一律丟 `Error('unstubbed logseq.DB.<name>')`**（未 stub 即失敗，CI 才不會再「從未真正執行」）。
  - 新增 `createSchemaAwareFake(kind)`（可放 `tests/helpers/graph-fake.ts`）：依查詢字串是否含該 kind 的屬性（file：`:block/content`；db：`:block/title`）決定回資料或 `[]`，**模擬「未知屬性回空集合」**。限制：僅基於文件化 schema，不能取代夜版實測。
- **新增測試：**
  - `tests/rag-state.test.ts`：(1) fetch 拋錯→`failed`、`vectorDb===null`、`showMsg(...,'error')`；(2) db + 停用 adapter→`unsupported`、**未呼叫** `datascriptQuery`、`showMsg` 以 `'warning'` 一次且無 `'success'`；(3) file 空圖 + canary 0→`empty`；(4) file 零結果 + canary>20→`unsupported/schema-mismatch`；(5) 成功路徑→`ready`（需 `fake-indexeddb` devDependency，`vi.mock('@orama/orama')`/`@huggingface/transformers` 於檔內覆寫 `tests/setup.ts:6-14`）；(6) **暖快取回歸**：全命中快取時 `extractor===null`，`searchSimilarBlocks` 會 lazy 載入並回 hits。
  - `tests/tools-unavailable.test.ts`：各 `SearchOutcome` 對應字串；斷言 unavailable 回應含 `"results":null` 且**不含** `"results":[]`；DB 下 `graph_tag_search`/`global_keyword_search` 回 `GRAPH_TYPE_UNSUPPORTED` 而非 "No results found"。
  - 既有 `tests/agent-stream.test.ts:8-10` 以 `vi.mock('../src/tools')` 隔離，不受影響。

### 3.8 變更檔案
`src/graph/types.ts`(新) `src/graph/kind.ts`(新) `src/rag.ts` `src/tools.ts` `src/i18n.ts` `tests/helpers/logseq-mock.ts` `tests/helpers/graph-fake.ts`(新) `tests/rag-state.test.ts`(新) `tests/tools-unavailable.test.ts`(新) `package.json`(devDep `fake-indexeddb`) `README.md`/`README.zh-TW.md`（註明 DB graph 尚未支援）`CHANGELOG.md`。**不改 `manifest.json`。**

### 3.9 驗收
- DB graph：載入後 ≤ 1 次 `warning` 彈窗；`semantic_search`/`graph_tag_search`/`global_keyword_search` 皆回 `status` 欄位明確的不支援字串；agent 不再回答「找不到相關筆記」。
- File graph（OG 宿主）：行為與 v0.10.0 相同；暖快取啟動後 `semantic_search` 有結果（修 F）。
- `npm run typecheck && npm test && npm run build` 綠。
- 全部 6 個新測試情境通過；未 stub 的 `DB.*` 呼叫會讓測試失敗。

### 3.10 回滾
`git revert` 該版；無資料遷移、IndexedDB 未動。

---

## 4. Phase 1｜GraphAdapter（v0.11.0，DB 預設旗標關閉直到夜版通過）

### 4.1 介面（`src/graph/types.ts` 擴充）
```ts
export interface GraphAdapter {
  readonly kind: GraphKind;
  fetchAllBlocks(): Promise<FetchBlocksResult>;                           // rag.ts:67
  blocksReferencingPage(page: string): Promise<RefHit[]>;                 // rag.ts:199
  keywordSearch(keyword: string, limit: number): Promise<KeywordHit[]>;   // tools.ts:251
  pageTree(pageNameOrUuid: string): Promise<BlockNode[] | null>;          // tools.ts:186 + agent.ts:37
  blockTree(uuid: string): Promise<BlockNode | null>;                     // tools.ts:206
}
export interface BlockNode  { uuid: string; text: string; children: BlockNode[] }
export interface RefHit     { text: string; fromPage: string }
export interface KeywordHit { uuid: string; pageTitle: string; text: string }
```
**為何是這五個：** 它們對應「內嵌 schema 知識」的五個呼叫點（`rag.ts:67`、`rag.ts:199`、`tools.ts:251`、`tools.ts:186`、`tools.ts:206`）。**你漏的不是第六個方法，而是第六個呼叫點**：`agent.ts:37-41`（`getPageBlocksTree`＋`getTxt`）與 `utils/markdown.ts:21`。因此 `pageOutline` 改名 `pageTree`（大綱由純函式從樹算出），`agent.ts` 與 `tools.ts` 共用同一讀取與 `blockText()`。另外兩個**純函式**（非方法）：`blockText(b)` 與 `pageDisplayName(p, kind)`（放 `src/graph/text.ts`），修 G/H/I。Phase 2 才加第六個方法 `blocksByUuid(uuids)`（增量同步用）。

### 4.2 `FileGraphAdapter`（`src/graph/file.ts`）：零行為變更
- 逐字搬移現行查詢字串與欄位解析（`rag.ts:68-72,78`；`rag.ts:202-206,216`；`tools.ts:254-259,272-273`；`getPageBlocksTree`/`getBlock` 呼叫）。
- `pageDisplayName` = `originalName ?? name`；`blockText` = `content`。
- 驗收手段：Phase 0 的 schema-aware fake 以 `kind:'file'` 跑同一組測試，**輸出字串逐字比對 v0.10.1 快照**（快照在 Phase 0 結束時錄製）。

### 4.3 `DbGraphAdapter`（`src/graph/db.ts`）：全走 `datascriptQuery`
通道理由：0.0.17 已有型別；無需 `customQuery`；`datascriptQuery` 輸出以 camel=false 正規化（鍵為 `title`、`full-title`、`page.title`，S2-db）。下列 datalog 皆 **[未證：夜版驗證]**，欄位名來源為 S3/S6。

**fetchAllBlocks**
```clojure
[:find (pull ?b [:block/uuid :block/title
                 {:block/page [:block/title]}
                 {:block/refs [:block/uuid :block/title]}])
 :where [?b :block/page ?p]            ; 排除頁面/class/property（它們沒有 :block/page）
        [?b :block/title ?c]
        [(not= ?c "")]]
```
- `text = row['full-title'] ?? row.title`（`:block/refs` 的 `[:block/uuid :block/title]` 讓 `recur-replace-uuid-in-block-title` 能解析 `[[uuid]]`，S6）；`pageName = row.page?.title ?? '未命名頁面'`。
- 已知待驗：property-value 文字區塊、已刪除（recycle）頁面的區塊是否混入——**不自創屬性名排除**，夜版以 N9/N20 的 count 對照決定要不要加過濾。

**blocksReferencingPage**（保留小寫 `:block/name` 做鍵；同名多頁全部納入）
```clojure
[:find (pull ?b [:block/title :block/uuid
                 {:block/page [:block/title]}
                 {:block/refs [:block/uuid :block/title]}])
 :in $ ?lower
 :where [?p :block/name ?lower]
        (or [?b :block/refs ?p] [?b :block/tags ?p])
        [(not= ?b ?p)]]
```
- 若 `:in` 參數化在 `datascriptQuery` 可行（SDK 支援 `...inputs`，S10）就用；否則沿用 `escapeDsString` 插值（與現行一致）。
- `fromPage = row.page?.title ?? row['full-title'] ?? row.title`（被標記的頁面本身無 `:block/page`）。

**keywordSearch**
```clojure
[:find (pull ?b [:block/uuid :block/title {:block/page [:block/title]}])
 :where [?b :block/page ?p] [?b :block/title ?c]
        [(clojure.string/includes? ?c "<kw>")]]
```
- 已知限制：比對 raw title，**只靠頁面引用出現的文字（`[[uuid]]`）會漏**。夜版 N11 驗證；若確認漏掉再加 `or-join` 比對 `:block/refs` 的 `:block/title`，**未驗證前不先寫**。
- 頁名直接取 pull 的 `page.title`，**去掉 file 版的 N+1 `Editor.getPage`**；case-sensitive 行為與現行一致。

**pageTree / blockTree**：`Editor.getPageBlocksTree(nameOrUuid)`、`Editor.getBlock(uuid,{includeChildren:true})`；以 `blockText()` 取字。**不傳 `includePage`**（頁面 uuid 回「找不到」是已知行為，文案改為「此 uuid 是頁面而非區塊，請改用 get_page_outline」——僅 DB 路徑，需驗證 N13）。

**其他呼叫點**
- `actions.ts:56` → `pageDisplayName(actualPage, kind)`（DB：`title ?? originalName ?? name`）。
- `actions.ts:132` → DB：`{ name: page.uuid }`；file：`{ name: pageName }`。
- `tools.ts:273`（file 版保留）→ DB 版由 adapter 直接回 `pageTitle`。

### 4.4 `src/graph/index.ts`：選擇與快取
```ts
export const DB_ADAPTER_ENABLED = false;   // 夜版 N0–N17 通過後翻 true（回滾＝翻回 false）
export async function getAdapter(): Promise<GraphAdapter | 'unsupported'>;
export function resetAdapter(): void;      // 清 adapter 與 graphKind 快取
```
- 快取鍵：`(await logseq.App.getCurrentGraph())?.url ?? path`；不同鍵即重算（`checkCurrentIsDbGraph` 成本低）。
- `DB_ADAPTER_ENABLED=false` 時 DB 行為＝Phase 0 的 `unsupported`。**因此 Phase 1 可在沒有 DB 環境下合併進 main**。

### 4.5 `onCurrentGraphChanged` 與 race
現況：`main.ts:281-290` 先 `await handleGraphChange()` 才 `initRAG()`；且 `rag.ts:96` `if (isSyncing) return` 會讓「A 圖仍在同步時切到 B」**直接放棄 B 的索引**，而 A 的同步完成後仍會寫 `vectorDb`（`rag.ts:163`）→ **B 圖 semantic_search 命中 A 圖內容**。

修法（沿用專案既有慣例：`state.contextGen`，`config.ts:28`）：
```ts
let syncGen = 0;
let syncChain: Promise<unknown> = Promise.resolve();
export function onGraphSwitched() {      // 同步函式，handler 的第一行
  syncGen++; vectorDb = null; indexState = { status: 'idle' };
  resetAdapter();
}
export function syncVectorDB() {         // 取代 isSyncing
  const gen = ++syncGen;
  syncChain = syncChain.then(() => run(gen));   // 序列化：同一時間只有一輪佔用 extractor
  return syncChain;
}
// run(gen)：每個 await 邊界後 `if (gen !== syncGen) return`，尤其在 rag.ts:163 寫 vectorDb 之前。
```
`main.ts` handler 順序：**① `onGraphSwitched()`（同步）→ ② `await actions.handleGraphChange()` → ③ `initRAG()`**。①放最前以關閉「事件到 UI 隔離完成」之間舊索引仍可被查詢的窗口。`initRAG()`（`main.ts:17-25`）因 `syncVectorDB` 內部已處理，無需新增 catch。

### 4.6 型別升級：升版 vs `as any`
| 方案 | 破損面 | 評語 |
|---|---|---|
| 升 `@logseq/libs` 到 `next`(0.3.4) | `latest` 仍是 0.0.17，`0.3.4` 是 `next` 預發佈（S15）；執行期 bundle 變動會影響**所有**現有 file-graph 使用者（且他們才是目前 100% 的使用者）；`DB.q` 回傳型別由 `Array\|null` 改 `Promise<T>`（本專案未使用 `DB.q`，grep 確認）；`BlockEntity.content` 變可選；`Request`→`Net`（本專案未使用）；舊宿主相容性 **[未證]** | 風險集中在「會動到既有使用者」 |
| 散落 `as any` | 無執行期風險，但無型別保護、難以回收 | 不建議 |
| **module augmentation（建議）** | 零執行期變更；`src/graph/sdk-augment.d.ts` 宣告合併 `IAppProxy.checkCurrentIsDbGraph`、`IDBProxy.customQuery`、`AppInfo.supportDb`（目標：`@logseq/libs/dist/LSPlugin`，d.ts 中皆為 exported interface：`:117,258,609`）；日後升版時刪此檔即可 | **採用**；以 `npm run typecheck` 驗證宣告合併生效（`moduleResolution: bundler` 下路徑可解析屬 [未證]，失敗則退回單檔 `as any` 包裝並集中於 `graph/kind.ts`） |

### 4.7 lowercase / slug 的條件化位置
- datalog 的 `:block/name` 比對**兩種後端都需小寫**（S3 註解；file 現況 `rag.ts:201`）→ 共用 `slug()`（`src/graph/text.ts`），**不需條件化**。
- 需要條件化的是**顯示與導航**：顯示用 `pageDisplayName`（DB `title`，file `originalName`）；`Editor.getPage` / `getPageBlocksTree` / `pushState` 一律使用**原始大小寫或 uuid**，永不傳 slug。
- DB 的真正差異是**歧義**：同名多頁。`blocksReferencingPage` 預期合併回傳；`getPage(name)` 取哪一頁 **[未證]**。

### 4.8 變更檔案
`src/graph/{types,kind,text,file,db,index}.ts`、`src/graph/sdk-augment.d.ts`、`src/rag.ts`、`src/tools.ts`、`src/actions.ts`、`src/agent.ts`、`src/utils/markdown.ts`（`getTxt` 改用 `blockText`）、`src/main.ts`、`tests/graph-file.test.ts`、`tests/graph-db.test.ts`（以 fake 驗證 datalog 屬性契約與欄位映射）、`tests/rag-race.test.ts`（切圖競態：A 進行中切 B，斷言 B 索引不含 A 內容、B 被索引）、`tests/markdown.test.ts`（補 `fullTitle`/`title` 後備）。

### 4.9 驗收
- File：快照比對與 v0.10.1 完全一致（含 `getTxt` 輸出）。
- DB（fake）：每條 DB 查詢字串含 `:block/title`、不含 `:block/content`；回傳映射欄位正確；`DB_ADAPTER_ENABLED=false` 時行為＝Phase 0。
- 競態測試通過；`typecheck/test/build` 綠。
- DB（夜版）：N0–N17 全過後才翻旗標。

### 4.10 回滾
翻 `DB_ADAPTER_ENABLED=false`（DB 回到 Phase 0 的明確不支援），或整版 revert；無資料遷移。

---

## 5. Phase 2｜砍掉 O(全圖) 啟動成本（每項可獨立發版；Phase 1 合併後再做，避免與 `rag.ts` 衝突）

**P2-0（先做）量測基線：** 在 `syncVectorDB` 各階段加 `performance.now()` 的 `logger.info`（fetch / hash / 讀快取 / 推論 / Orama 重建）、並記錄 `blockCount` 與向量記憶體估算（`vector[512]`×N）。沒有數字就不做降級決策。

按 CP 值排序：

| # | 項目 | 預期收益 | 風險 | 可獨立發版 |
|---|---|---|---|---|
| **P2-1** | **單一 IDB 連線**：每次同步 `openDB()` 一次，`finally` 關閉；`getCachedEmbedding`/`saveCachedEmbeddings`（`rag.ts:33-54`）改收 `db` 參數。現況每個區塊一次 open+close（`rag.ts:117`）。 | N 次 `indexedDB.open` → 1 次；改動最小、無資料格式變更 | 低（連線生命週期；中途例外須在既有 `finally` 關閉） | 是 |
| **P2-2** | **批次讀取＋分塊雜湊**：`store.getAllKeys()`（只含字串）建 `Set`，僅對命中者以單一 readonly 交易分塊（如 500）`get`；SHA-256 由 `Promise.all(全圖)`（`rag.ts:110`）改分塊，限制同時在飛數 | 去掉 N 次 `await` 往返與 N 個同時 digest 的記憶體尖峰 | 低；IDB 交易在無待決請求時自動提交，須在同一同步段內發出整批請求（單元測試以 `fake-indexeddb` 覆蓋） | 是（依賴 P2-1） |
| **P2-3** | **快取 key 去 uuid**：新 key = `v2\|bge-small-zh-v1.5\|${graphName}\|sha256(contextualText)`，其中 `contextualText` 即實際送入模型的字串（`rag.ts:143`，含頁名）。附帶修正「key 只雜湊內容、頁名變更卻不失效」的既有瑕疵。**不使舊快取失效：雙讀**——先查新 key；未命中再查舊 key `${graphName}_${id}_${hash(content)}`，命中即以新 key 回寫（惰性遷移）。舊條目保留不刪。 | 區塊 uuid 變動（搬移/複製、file graph 重新索引後無 `id::` 的區塊換 uuid〔一般行為，本次未於來源證實〕）不再造成全圖重算；key 成為輸入的純函數 | 中：雙讀期間查詢次數 ×2（受益於 P2-2 的 `getAllKeys` Set 預濾，幾乎免費）；舊條目殘留（孤兒清理不在本次範圍） | 是（需 P2-1/2 之後，否則雙讀放大逐筆成本） |
| **P2-4** | **`DB.onChanged` 增量同步**：訂閱 `logseq.DB.onChanged`（`IUserHook`，d.ts `:625`；回傳 off 函式），依 txData 取受影響區塊 uuid → `adapter.blocksByUuid(uuids)` → 重算 → Orama `insert`/`remove`/`update`（API 以專案內 `@orama/orama ^3.1.18` 實際型別為準）。切圖時先 off 再 on。 | 執行期免全量 fetch/雜湊/重建 | **高**：txData 屬性名格式（`:block/title` 或 `block/title`）、刪除/undo/RTC 大量交易、與 P2-3 key 的一致性 **皆 [未證]** → 夜版 N19 記錄真實 payload 後才實作；需 debounce 與回退到全量同步的保險 | 是，但排最後 |

**降級（只索引有 refs 的區塊）是否需要？** 目前**不需要，也不該做靜默降級**：
- 沒有量測數據（P2-0 之前無法判斷），且 README:29 以「全圖譜語意掃描」為賣點，靜默降級＝虛假宣傳。
- 真正的上限很可能是**記憶體**（每區塊 512 維向量常駐 RAM）而非時間；以 P2-0 數字決定。
- 若量測後確需降級，必須：① 新設定 `ragIndexScope: 'all' | 'linked-only'`，預設 `'all'`，由使用者啟用，**不自動切換**；② 若採「超過閾值自動降級」則 `showMsg('已索引 X / 共 Y 區塊（略過 Z 個無連結區塊），語意搜尋為部分覆蓋', 'warning', { timeout: 0 })`，每圖一次；③ `semantic_search` 回應加 `"index_scope":"partial","indexed":X,"total":Y`，讓 agent 不能宣稱涵蓋全圖；④ 同步更新 README:29。

### 變更檔案 / 驗收 / 回滾
- 檔案：`src/rag.ts`（P2-1~3 可抽出 `src/embeddingCache.ts` 以利 mock）、`src/graph/{types,file,db}.ts`（P2-4 新增 `blocksByUuid`）、`tests/embedding-cache.test.ts`（`fake-indexeddb`）、`tests/rag-incremental.test.ts`。
- 驗收：P2-1 `indexedDB.open` 呼叫次數＝1（spy）；P2-2 已命中快取之啟動不產生逐筆往返、同時在飛 digest ≤ 分塊大小；P2-3 舊 key 資料集啟動後**零次模型推論**且新 key 已回寫、改頁名只重算該頁區塊；P2-4 編輯單一區塊只觸發 1 筆 embedding 且 Orama 命中數正確。
- 回滾：各項 revert 即可；P2-3 因採雙讀且不刪舊 key，回滾後舊快取仍有效。**成本計算：** 若不採雙讀直接換 key，代價＝整圖 N 筆區塊重新推論（單筆耗時**未量測**，故不給數字；P2-0 的基線會提供）；模型本體（約 90MB）由 transformers 快取，不會因更換 IDB key 重新下載。

---

## 6. Phase 3｜可攜性（可延後；不動 `memory.ts` 既有格式）

現況：對話存 localStorage，key 為 `impeller_chat_<encodeURIComponent(graphPath)>_<pageUuid>`（`memory.ts:6,23-36`）。DB 圖譜的 `graph.path` 是否穩定 **[未證]**（N16）。

**最小設計（兩個 command palette 指令，不碰側欄 UI）：**
- `Impeller: Export chat history (JSON)`：輸出 `{ schema:'impeller-chat-export/1', exportedAt, graph:{ name, kind }, pages:[{ uuid, name, chat:{ name, msgs, summary } }] }`；下載方式複用 `panel.ts:94-103`。**絕不含 API key / settings**；匯出前 `showMsg` 提示內容可能含敏感對話。
- `Impeller: Import chat history (JSON)`：動態建立 `<input type=file>`（`parent.document`）；驗證 `schema`、大小上限、`msgs` 形狀；合併策略 = 以 page uuid 對應，找不到則以 `name` 經 `Editor.getPage(name)` 映射到新圖 uuid，仍找不到者略過並回報數量；衝突時保留「最後訊息時間較新」者，**永不刪除既有對話**。寫入走既有 `MemoryManager.saveHistory`。
- **圖譜內備援（選配、最後做）：** 以 `createPage('Impeller Chat Backup')` + 每頁一個區塊（fenced `json` 程式碼區塊），**不使用 `properties`**（IBatchBlock.properties 在 DB 不支援，前提 5）。必須：① 在兩種 adapter 的 `fetchAllBlocks` 中**排除該頁**（否則備份 JSON 會被自己索引）；② 預設關閉並明示隱私；③ DB 寫入行為只能夜版驗證（N22）。

檔案：`src/backup.ts`(新)、`src/main.ts`（註冊兩個指令）、`tests/backup.test.ts`。驗收：匯出→清 localStorage→匯入，`MemoryManager` 讀回等價；損壞/超大檔被拒且無部分寫入。回滾：移除指令即可，無資料格式變更。

---

## 7. DB graph 夜版手動實測清單

**N0 環境**：安裝 DB 版夜版；建一個測試 DB graph，內容至少包含：①同名不同 tag 頁（`Apple #Company`、`Apple #Fruit`）②含 `[[頁面引用]]` 與 `#tag` 的區塊 ③標題含大寫英文與中文的頁 ④三層巢狀區塊 ⑤已刪除（recycle）的頁 ⑥含文字型 property 值的區塊 ⑦今日 journal ⑧一頁約 2000 區塊（量測用）。另備第二個 DB graph（N17）。啟用本插件（`effect:true`）。

| # | 操作 | 應看到 | 失敗判定 |
|---|---|---|---|
| N1 | 啟動 → console 執行 `await logseq.App.getInfo()`、`await logseq.App.checkCurrentIsDbGraph()` | `supportDb:true`、`true` | undefined / 拒絕 / 與預期不符（改探測邏輯） |
| N2 | 看頂部工具列 `registerUIItem('toolbar')` 圖示，點擊 | 圖示出現；點擊開關面板 | 無圖示或點擊無反應 |
| N3 | 側欄**關閉**時點工具列圖示（`panel.ts:15-16`：`setRightSidebarVisible(true)` + 150ms） | 側欄開啟且 `#ai-sidebar-container` 渲染；**一次點擊成功** | 需點兩次、容器缺失、`.sidebar-item-list` 查無（S8：僅 open 時渲染） |
| N4 | 以快捷鍵關閉再開側欄（`state.isVisible` 仍 true） | 面板仍在 | 面板消失（`.sidebar-item-list` 被重建） |
| N5 | 側欄中再開 Contents/Help/頁面，或關閉其他項 | 外掛面板維持、不重複、不被清掉 | 面板被 React reconcile 清除或位置錯亂 |
| N6 | 調整側欄寬度、折疊、換主題（dark/light） | 樣式正常（`ui/styles.ts` 選擇器 `#right-sidebar #ai-sidebar-container`） | 樣式失效 |
| N7 | 開 `Apple`（大小寫混合）頁，看聊天標題 | 標題為 `Apple`（保留大小寫） | 變 `apple`（`originalName` 缺失，H） |
| N8 | zoom-in 進某個區塊（區塊路由） | `currentPageUuid`＝所屬頁 uuid（console 檢查 `state`） | 為區塊 uuid |
| N9 | 啟用 DB adapter 後首次索引：記錄 `blockCount`；與 Logseq UI/`[:find (count ?b) . :where [?b :block/page _] [?b :block/title ?t] [(not= ?t "")]]` 對照 | 數量吻合；索引文字**不含 `[[uuid]]`**（抽樣 5 筆） | 含 uuid 噪音（`full-title` 鍵名或解析失敗）；混入 property 值/recycle 區塊（決定是否加過濾） |
| N10 | 問 agent「Apple 相關筆記」→ `graph_tag_search` 用 `apple`、`Apple` 各一次 | 兩者結果一致，涵蓋兩個同名頁的引用與被標記物件 | 只回一個頁面、或大小寫影響結果、或被標記頁面缺失 |
| N11 | `global_keyword_search`：關鍵字出現在純文字 / 只出現在頁面引用的顯示名 | 純文字命中；後者的漏掉屬已知限制，記錄是否需 `or-join` | 例外、空結果但 UI 搜尋有結果（純文字情況） |
| N12 | `get_page_outline`：傳原始大小寫、全小寫、同名頁、空頁 | 回大綱含 UUID；空頁回明確錯誤；巢狀 `children` 結構與 file 版一致 | `b.content` undefined、無 `children`、拋 TypeError |
| N13 | `read_target_block`：給**區塊** uuid；給**頁面** uuid | 區塊回全文＋子孫；頁面 uuid 回明確「是頁面」訊息（驗 `includePage` 行為） | 區塊也回「找不到」 |
| N14 | 開一個含頁面引用的頁，送一則訊息，檢查送出的頁面上下文（`agent.ts:37-41`） | 文字為可讀頁名，無 `[[uuid]]` | 出現 uuid |
| N15 | 點聊天內 `[[頁面]]` 連結：①大小寫混合名 ②同名頁 ③中文名，各以 `{name}` 與 `{name: uuid}` 兩種實測 | 跳到正確頁；uuid 版最穩 | 建立新空白頁、跳錯頁、無反應 |
| N16 | 產生對話 → 完全重啟 app → 回同圖同頁；再切到另一圖再切回 | 歷史仍在；兩圖歷史不混 | 重啟後歷史消失（`graph.path` 不穩）；兩圖共用 key |
| N17 | 圖 A（大）索引進行中立刻切到圖 B | B 於自己的索引完成後可搜尋；搜 B 不會出現 A 的內容；A 的完成事件被丟棄 | B 永遠不被索引；B 命中 A 內容 |
| N18 | 重啟後第二次索引（暖快取，Phase 2 後） | 零推論、`semantic_search` 有結果 | 無結果（F 迴歸） |
| N19 | 在 console 訂閱 `logseq.DB.onChanged` 並 `console.log(JSON.stringify(e.txData))`：編輯/刪除/undo/貼上區塊 | 記錄屬性名格式與 `blocks` 形狀，供 P2-4 設計 | 無事件或格式與假設不同（P2-4 暫緩） |
| N20 | 刪除含 N 個區塊的頁後重新同步 | 已刪頁區塊**不應**被索引（若會，需查正確屬性再加過濾） | 刪除後仍可被搜到 |
| N21 | `onCurrentGraphChanged` 觸發次數與時機（console log） | 切圖僅觸發一次 | 重複觸發導致多輪同步 |
| N22 | Phase 3 備援：`createPage`+`insertBlock` 寫入含 fenced JSON | 區塊完整保存、重新索引時被排除 | 內容被截斷/轉義 |

**OG 回歸（file graph，現行使用者環境）— R1**：在 0.10.x 宿主上確認 `getInfo()` 形狀（無 `supportDb` → 判為 file）、全部既有功能與 v0.10.0 一致；每個 phase 發版前必跑。

---

## 8. 發版與 marketplace 順序

1. **v0.10.1（Phase 0）**：只改行為不改 manifest。README 註明 DB graph 尚未支援。因 `supportsDB` 預設 false（S13），不需任何 marketplace 動作；既有條目隨 GitHub Release（`publish.yml`）更新。
2. **v0.11.0（Phase 1）**：程式碼可先合併（旗標關閉＝行為同 v0.10.1）。**只有 R1 與 N0–N17 通過後**才：翻 `DB_ADAPTER_ENABLED=true`、打 tag、發 Release。
3. **Marketplace PR**（`logseq/marketplace`）：於同一版發佈後送出，修改該插件 `packages/<既有目錄>/manifest.json`（目錄名以 repo 內實際為準，本地無法確認）：新增 `"supportsDB": true`；**不加** `supportsDBOnly`；**不加** `unsupportedGraphType`。同步在本 repo 根目錄 `manifest.json` 加 `"supportsDB": true`（現為 `title/description/author/repo/icon/effect`）。`scripts/build.mjs` 對 manifest 欄位為原樣透傳（S13-build），欄位語意由客戶端解讀 → 送 PR 前於 DB 版 app 的 Marketplace 檢視是否顯示 DB 支援標記 **[未證]**。`effect:true` 維持（隨 PR 進入較嚴格審查，既有狀態不變）。
4. **v0.11.x/0.12.0（Phase 2）**：P2-1→P2-2→P2-3 各自小版本；P2-4 待 N19。
5. **Phase 3**：獨立 minor。

---

## 9. 哪些能在沒有 DB graph 環境完成、哪些必須實測才能合併

| 類別 | 項目 |
|---|---|
| **無需 DB 環境即可完成並合併** | Phase 0 全部（含 mock 修法、狀態機、LLM 字串、F 修復）；Phase 1 的介面/`FileGraphAdapter` 搬移/`text.ts`/`kind.ts`/module augmentation/世代 token 競態修復與測試/`DB_ADAPTER_ENABLED=false` 下的合併；Phase 2 的 P2-0~P2-3（以 `fake-indexeddb` 單元測試；真實效能需大型 file graph）；Phase 3 的 JSON 匯出入 |
| **需要 OG（file graph）宿主實測** | R1（探測在舊宿主的形狀、行為零變更、F 修復） |
| **必須 DB 夜版實測才能合併/發佈** | 翻 `DB_ADAPTER_ENABLED=true`；`DbGraphAdapter` 每條 datalog（`full-title` 鍵、過濾條件、`:block/tags` 行為）；`openPage` 參數；`getPageBlocksTree` 巢狀結構；同名頁行為；側欄掛載（N3–N6）；`graph.path` 穩定性（N16）；marketplace `supportsDB` PR；P2-4 的 txData 格式（N19）；Phase 3 圖譜內備援寫入（N22） |

---

## 10. 未證實清單（彙整，皆需夜版或舊宿主實測）
1. datascript 對未知屬性回空集合而非丟錯（Phase 0 兩種情況都已涵蓋）。
2. 舊宿主 `getInfo()` 形狀與缺方法時 `checkCurrentIsDbGraph` 的 rejection 行為。
3. 發佈版/夜版的 `customQuery` 實作是否同 master（本計畫刻意不依賴）。
4. `:block/refs` 是否含 tag 指向；`:block/tags` 需要 `or` 的必要性。
5. `getPageBlocksTree` 巢狀結構；`getPageLinkedReferences` 實際回傳形狀。
6. `getPage(name)` 在同名頁下的選擇；Web 平台路由名是否 lowercase。
7. `full-title` 在 `datascriptQuery` 輸出（camel=false → `full-title`）的實際鍵名與解析結果。
8. property-value 區塊與 recycle 頁面是否混入索引（不自創排除屬性）。
9. module augmentation 在 `moduleResolution: bundler` 下可解析。
10. 側欄 `provideUI` 注入在 DB 的穩定性。
11. `graph.path` 在 DB 圖譜的穩定性。
12. marketplace 客戶端對 `supportsDB` 缺省/為真的實際呈現。

---

## 來源表
- **S1** `libs/src/LSPlugin.ts` master — https://raw.githubusercontent.com/logseq/logseq/master/libs/src/LSPlugin.ts （`AppInfo.supportDb`、`checkCurrentIsDbGraph`、`customQuery`、`BlockEntity.title/fullTitle`、`PageEntity.title`）
- **S2-api** https://raw.githubusercontent.com/logseq/logseq/master/src/main/logseq/api.cljs （`check_current_is_db_graph`、`push_state`）
- **S2-app** …/logseq/api/app.cljs （`get_app_info` → `supportDb true`）
- **S2-db** …/logseq/api/db.cljs （`datascript_query`、`custom_query`）
- **S2-editor** …/logseq/api/editor.cljs （`get_page`、`get_block`、`get_page_blocks_tree`、linked refs）
- **S2-block** …/logseq/api/block.cljs （`includePage`/`includeChildren`）
- **S2-utils** …/logseq/sdk/utils.cljs （`normalize-keyword-for-json`：附加 `content`/`full-title`）
- **S2-async** …/frontend/db/async.cljs （`<get-block`、`<get-page-blocks-tree`、`<get-case-page`、`<page-exists?`）
- **S3** https://raw.githubusercontent.com/logseq/logseq/master/deps/db/src/logseq/db/frontend/schema.cljs
- **S4** …/deps/db/src/logseq/db/frontend/rules.cljc （`has-ref`）
- **S5** …/src/main/frontend/worker/handler/query.cljs （`add-query-rules`、`execute-custom-query`）
- **S6** …/deps/db/src/logseq/db/frontend/content.cljs （`[[uuid]]` 存法、`recur-replace-uuid-in-block-title`）
- **S7** …/src/main/frontend/handler/route.cljs （`redirect-to-page!`）
- **S8** …/src/main/frontend/components/right_sidebar.cljs
- **S9** https://raw.githubusercontent.com/logseq/docs/master/db-version-changes.md 與 `db-version.md`、`libs/guides/db_properties_references.md`
- **S10** https://raw.githubusercontent.com/logseq/logseq/master/libs/src/LSPlugin.user.ts （`_makeUserProxy`、`getInfo`、`datascriptQuery`、`scrollToBlockInPage`）
- **S11** https://github.com/benjypng/logseq-zoterolocal-plugin `src/index.tsx`、`services/insert-zot-into-graph.ts`、`is-page-empty.ts`、`sync-annotations.ts`
- **S12** https://github.com/kerim/logseq-checklist `manifest.json`、`src/events.ts`、`src/progress.ts`
- **S13** https://raw.githubusercontent.com/logseq/marketplace/master/README.md （`supportsDB`/`supportsDBOnly`）；S13-build `scripts/build.mjs`；S13-zotero `packages/logseq-zoterolocal-plugin/manifest.json`；舊欄位 `unsupportedGraphType` 見 deepwiki.com/logseq/marketplace/8.1-manifest.json-specification（可能過時）
- **S14** 本機 `node_modules/@logseq/libs/dist/LSPlugin.d.ts`（0.0.17）：`:117 AppInfo`、`:149 BlockEntity`、`:155 content`、`:177-181 PageEntity.originalName`、`:263 getInfo`、`:337 pushState`、`:349 setRightSidebarVisible`、`:353 registerUIItem`、`:360 onCurrentGraphChanged`、`:489 getPageBlocksTree`、`:494 getPageLinkedReferences`、`:539 getBlock`、`:555 getPage`、`:609 IDBProxy`、`:615 q`、`:619 datascriptQuery`、`:625 onChanged`
- **S15** https://registry.npmjs.org/-/package/@logseq/libs/dist-tags → `latest:0.0.17`、`next:0.3.4`
- 本地程式碼：`src/rag.ts`、`src/tools.ts`、`src/actions.ts`、`src/agent.ts`、`src/main.ts`、`src/memory.ts`、`src/panel.ts`、`src/ui.ts`、`src/utils/markdown.ts`、`src/config.ts`、`tests/helpers/logseq-mock.ts`、`tests/setup.ts`、`tsconfig.json`、`manifest.json`、`package.json`
