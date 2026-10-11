# Phase 1（GraphAdapter，v0.11.0）實作計畫

> 依據：`1791704842259-db-graph-compat-plan.md` §4 ＋ 任務說明中的 Phase 0 實際狀態差異（1–6）。
> 硬性約束全程遵守：`DB_ADAPTER_ENABLED` 保持 `false`；不碰 UI／`memory.ts`／IndexedDB schema；Phase 2 不做；mock 未 stub 的 `DB.*` 一律丟錯不放寬。

---

## 0. 結論先行

- 五方法 adapter（§4.1）＋ `text.ts` 純函式 ＋ `index.ts` 選擇器 ＋ module augmentation ＋ 世代 token 競態修復，分 **4 個 commit**，每個 commit 獨立 `typecheck && test && build` 全綠。
- file 路徑逐字搬移，以既有 5 呼叫點快照逐字比對把關；補錄 `getTxt` 第 6 基準（差異 #6），快照檔案對既有 5 鍵**只增不減、內容零 diff**。
- 有 **6 個計畫文字的解釋/偏離點**（§1 決策 #1–#6）需要你核准，其中 #1（getAdapter 不回 `'unsupported'`）與 #3（DB fetch 鏡像 canary）影響最大。

---

## 1. 設計決策（含對 §4 文字的解释，需核准）

### 決策 #1：`getAdapter()` 一律回傳具體 adapter，移除 §4.4 的 `| 'unsupported'` 聯集
§4.4 寫 `getAdapter(): Promise<GraphAdapter | 'unsupported'>`，但照字面實作會**回歸 Phase 0 行為**：旗標關時 DB 圖譜的 `get_page_outline`／`read_target_block`／`agent.ts` 頁面上下文走 Editor API，Phase 0 本来就可用（§3.6「Phase 0 不動」），且**夜版 N14 要求旗標關時頁面上下文已是可读名（無 `[[uuid]]`）**——這只有在 DB 圖譜也實際路由到 `DbGraphAdapter.pageTree`（以 `blockText()` 取字）時才成立。
→ 修法：`getAdapter()` 依 kind 回 `FileGraphAdapter` 或 `DbGraphAdapter`，**永不回 `'unsupported'`**。三道 datalog 表面（`fetchAllBlocks`／`blocksReferencingPage`／`keywordSearch`）的閘門維持在**收攏謂詞 `isGraphUnsupported`**（差異 #2）：`rag.ts` 的 DB 分支 ＋ `tools.ts` 兩個守衛，共三處共引同一來源。旗標關＝DB 圖譜上三個 datalog 工具回 `GRAPH_TYPE_UNSUPPORTED`（＝Phase 0），Editor-API 三讀取（outline／read block／頁面上下文）照常運作且取 `fullTitle`。

### 決策 #2：`DB_ADAPTER_ENABLED` 與 `isGraphUnsupported` **搬到** `src/graph/index.ts`（不 re-export）
§4.4 把旗標放 `index.ts`；現況在 `kind.ts`（差異 #1）。若探測模塊（kind）反向依賴 index 取旗標會形成循環 import。
→ 分工：`kind.ts` 只留純探測（`probeGraphKind`／`getGraphKind`／`getGraphCacheKey`／`resetGraphKind`）；`index.ts` 持有旗標、`getAdapter`、`resetAdapter`、`isGraphUnsupported`，单向依賴 `kind.ts`。`rag.ts`／`tools.ts` 的 `isGraphUnsupported` import 改指 `./graph`（函數語義不變，三處收攏點維持）；測試用的 `resetGraphKind` import 路徑不變，既有測試零改動。

### 決策 #3：`DbGraphAdapter.fetchAllBlocks` 鏡像 file 版 canary（§4.8 清單外新增一個小檔案）
§4.3 的 DB fetch 沒寫 canary，但 §0.2 明示最大風險是「成功但空」；canary 查詢 `[:find (count ?b) . :where [?b :block/page _]]` 用的 `:block/page` 在 DB schema 同樣存在（S3），零新增未證屬性。
→ `countPageBlocksCanary` 從 `rag.ts` 抽到新葉模組 `src/graph/canary.ts`，兩 adapter 共用：DB 零結果時同样判 `schema-mismatch` vs `empty`。若你要嚴格照 §4.3（DB 不加 canary），撤掉只是 db.ts 一行，核准時勾選即可。

### 決策 #4：`blockText()` 的優先序覆蓋三種形狀
```ts
b?.text ?? b?.fullTitle ?? b?.['full-title'] ?? b?.content ?? b?.title ?? ''
```
- `text`：`BlockNode`（adapter 間傳遞形狀，`getTxt`/`tools` 吃它）
- `fullTitle`：Editor API DB 實體（camelCase，S2-utils/S1）
- `full-title`：`datascriptQuery` 正規化輸出（kebab，§4.3；鍵名 [未證]，靠 `??` 鏈退化不崩潰）
- `content`／`title`：file 實體／DB raw
file 實體只有 `content` → 命中 `content`，**逐字等價現行 `b.content ?? ''`**（G 修復同時生效：全缺時回 `''` 而非 `undefined` 字串化）。

### 決策 #5：DB `blocksReferencingPage` 用 `escapeDsString` 插值，不用 `:in`
§4.3 說「若 `:in` 可行就用」——[未證] 且無法在無 DB 環境驗證。插值是現行 file 版已上線的同一通道（零新增未證行為）。N10 夜版驗證後若要改 `:in`，是 db.ts 內的獨立小改。

### 決策 #6：`read_target_block` 的「uuid 是頁面」文案放在 `tools.ts` 的 null 分支
§4.3 要求 DB 路徑改文案，但 §4.1 介面是 `blockTree(): Promise<BlockNode | null>`，干淨五方法介面不值得為一條文案開洞。
→ `tools.ts`：adapter 回 `null` 且 `kind==='db'` 時補一次 `Editor.getPage(uuid)`（快取探測，純讀）；命中頁 → 回「此 uuid 是頁面而非區塊，請改用 get_page_outline」陳述字串；否則維持原文案「找不到此區塊，可能已被刪除。」。file 路徑零額外呼叫、逐字不變。

---

## 2. §4.8 檔案清單 → 執行順序與逐檔變更

順序即依賴序（箭頭單向，無循環）：

```
types.ts ──► text.ts ──► canary.ts
                │
kind.ts ◄──────┤（純探測，aug 型別生效後去 as any）
   │           ▼
   └───── index.ts（旗標＋getAdapter＋isGraphUnsupported＋resetAdapter）
                │
      ┌─────────┴─────────┐
      ▼                   ▼
  file.ts（逐字搬）    db.ts（§4.3 datalog）
      └──────────────────┘
                ▼
  rag.ts ／ tools.ts ／ agent.ts ／ markdown.ts ／ actions.ts ／ main.ts
```

| # | 檔案 | 動作 | 重點 |
|---|------|------|------|
| 1 | `src/graph/types.ts` | 擴充 | 加 `GraphAdapter`／`BlockNode`／`RefHit`／`KeywordHit`（§4.1 原樣）。既有型別不動；`building.gen?: number` 留給 C3 填（差異 #4） |
| 2 | `src/graph/sdk-augment.d.ts` | 新 | 宣告合併 `@logseq/libs/dist/LSPlugin`：`AppInfo.supportDb?: boolean`、`IAppProxy.checkCurrentIsDbGraph(): Promise<boolean>`、`IDBProxy.customQuery`（§4.6 原樣宣告，Phase 1 不使用但依計畫列入）。typecheck 驗證生效；失敗走 §5 備援 |
| 3 | `src/graph/text.ts` | 新 | `blockText()`（決策 #4）、`pageDisplayName(p, kind)`（file：`originalName \|\| name`；db：`title \|\| originalName \|\| name`，修 H）、`slug()`（現行 `rag.ts:282` 的 lowercase＋去 `#`，§4.7 兩種後端共用） |
| 4 | `src/graph/canary.ts` | 新 | `countPageBlocksCanary()` 從 `rag.ts:80-90` 逐字搬出（決策 #3） |
| 5 | `src/graph/kind.ts` | 縮 | 移出旗標與 `isGraphUnsupported`（決策 #2）；`probeGraphKind` 去 `as any`（吃 aug 型別）；快取／`resetGraphKind` 不動 |
| 6 | `src/graph/file.ts` | 新 | `FileGraphAdapter`：五方法**逐字**搬 `rag.ts:104-125`（fetch＋canary 分支）、`rag.ts:283-298`（refs 查詢＋`original-name`／`未知頁面` 映射；**保留現行無 `not=` 過濾**）、`tools.ts:302-323`（keyword：`pull [*]`＋N+1 `getPage`→`page.name`（非 originalName，逐字）＋slice(limit) 移進 adapter）、`getPageBlocksTree`／`getBlock(uuid,{includeChildren:true})` → `BlockNode` 遞迴映射（text 走 `blockText`＝`content`） |
| 7 | `src/graph/db.ts` | 新 | `DbGraphAdapter`：§4.3 三段 datalog **原樣、零自創屬性**；`text=blockText(row)`、`pageName=row.page?.title ?? '未命名頁面'`、`fromPage=row.page?.title ?? blockText(row) ?? '未知頁面'`；keyword 直接取 pull 的 `page.title`（去掉 file 版 N+1）；pageTree/blockTree 走 Editor API＋`blockText`（fullTitle 優先）；fetch 零結果接 canary（決策 #3） |
| 8 | `src/graph/index.ts` | 新 | `DB_ADAPTER_ENABLED=false`（唯一家）；`getAdapter()` 以 graphKey 快取（決策 #1，無 `'unsupported'` 聯集）；`isGraphUnsupported(kind?)` 收攏點迁入；`resetAdapter()`＝清 adapter 快取＋`resetGraphKind()`（§4.4） |
| 9 | `src/rag.ts` | 改 | `fetchLogseqBlocks`→ 守衛＋`adapter.fetchAllBlocks()`（回傳形狀／`detail` 字串維持）；`getLinkedReferencesForPage`→ `slug()`＋`adapter.blocksReferencingPage()`，**格式化字串／catch／i18n 全留在 rag.ts 原樣**（LLM 面向文案零變更）；`searchSimilarBlocks`／快取層／`ensureExtractor` 不動 |
| 10 | `src/tools.ts` | 改 | `isGraphUnsupported` import 改 `./graph`（兩個守衛呼叫點不變）；`get_page_outline`→`adapter.pageTree`＋原格式化；`read_target_block`→`adapter.blockTree`＋決策 #6；`global_keyword_search`→`adapter.keywordSearch`＋原報告字串（含 `No results found`／`Search failed.` 原樣——D/E 的語意已由 unsupported 閘承擔，file 文案零變更） |
| 11 | `src/agent.ts` | 改 | `buildPageContextPrompt`：`getPageBlocksTree`＋`getTxt` → `adapter.pageTree(pageUuid)`＋`getTxt(nodes)`（§4.1 第六呼叫點收攏；file 逐字等價，DB 得 fullTitle 可讀名＝N14 前提） |
| 12 | `src/utils/markdown.ts` | 改 | `getTxt` 改吃 `blockText(b)`（決策 #4；file 等價） |
| 13 | `src/actions.ts` | 改 | `:56` → `pageDisplayName(actualPage, await getGraphKind()) \|\| 'Untitled'`（kind 有快取，熱路徑零額外 IPC）；`openPage` → `pushState('page', { name: kind==='db' ? page.uuid : pageName })`（§4.3／Q3 決策） |
| 14 | `src/main.ts` | 改（C3） | `onCurrentGraphChanged` 順序：① `onGraphSwitched()`（同步）→ ② `await actions.handleGraphChange()` → ③ `initRAG()`（差異 #5，唯一真實競態修復） |

---

## 3. 拆分 commit（每個獨立綠，revert 粒度清晰）

| Commit | 內容 | 檔案 | 驗證 |
|--------|------|------|------|
| **C1** `feat(graph): add GraphAdapter layer with file/db implementations (flag off)` | 圖 1–10、12 的 adapter 基建＋`rag.ts`／`tools.ts`／`markdown.ts` 路由（`getTxt`→`blockText` 與 adapter 同 commit，否則 BlockNode 斷裂） | `graph/{types,text,canary,kind,index,file,db}.ts`、`sdk-augment.d.ts`、`rag.ts`、`tools.ts`、`utils/markdown.ts`、新測試 `graph-file`／`graph-db`、`markdown.test.ts` 補 blockText 案例 | 既有 5 鍵快照逐字不變；`rag-state`／`tools-unavailable` 全綠（旗標關＝Phase 0 行為） |
| **C2** `feat(graph): route page context and navigation through adapter` | 圖 11、13 ＋ 快照補第 6 鍵 `getTxt`（差異 #6 基準錄製） | `agent.ts`、`actions.ts`、`file-graph-snapshot.test.ts` | 快照 diff **只有新增鍵**；既有 5 鍵零位元變化 |
| **C3** `fix(rag): generation-token sync, reset on graph switch` | §4.5 競態修復：`syncGen`／`syncChain`／`run(gen)`／`onGraphSwitched()`；`building.gen` 填實（差異 #4）；`main.ts` 三步順序（差異 #5） | `rag.ts`、`main.ts`、新測試 `rag-race.test.ts` | 切圖競態測試綠；`rag-state` 六情境不改斷言仍綠 |
| **C4** `chore(release): v0.11.0` | `npm run bump 0.11.0`（package.json＋README badge）＋ `CHANGELOG.md` 新條目（註明 DB adapter 已落地但旗標關閉，DB 支援待夜版 N0–N17） | `package.json`、`README*.md`、`CHANGELOG.md` | 全綠；**不打 tag、不動 manifest 的 supportsDB**（§8：發版動作在夜版通過後另辦） |

---

## 4. 測試計畫

| 檔案 | 性質 | 覆蓋 |
|------|------|------|
| `tests/file-graph-snapshot.test.ts` | 修改（C2 加第 6 鍵） | §4.2 零行為變更的逐字把關；`getTxt(OUTLINE_TREE)` 基準補錄 |
| `tests/graph-file.test.ts`（§4.8 列出） | 新 | adapter 層：BlockNode 映射、keyword slice(limit)＋`Unknown Page` 回退、refs 映射含 `未知頁面`、fetch canary 兩分支——均以 schema fake 驅動，補快照未覆蓋的邊界 |
| `tests/graph-db.test.ts` | 新（`dbBlockRow()` 第一個消費者） | §4.9 DB(fake)：每條 DB datalog **含 `:block/title`、不含 `:block/content`**；`full-title ?? title` 優先序；`page.title` 映射；`(or refs tags)`＋`not=` 查詢結構；fromPage 回退鏈；pageTree/blockTree 以 mock Editor 餵 `fullTitle` 實體驗證取字；**旗標關時 `fetchLogseqBlocks` 不觸及任何 DB 查詢**（不鬆 mock 慣例） |
| `tests/rag-race.test.ts` | 新 | §4.5／N17：deferred fake 控制時序——A 同步中 `onGraphSwitched()` → B 同步完成 → A 的遲到結果被丟棄（不寫 `vectorDb`／`indexState`、不彈 A 的 error toast）；B 索引不含 A 內容；`syncChain` 序列化（兩輪不併發佔用 extractor） |
| `tests/markdown.test.ts` | 補強 | `blockText` 優先序（text/fullTitle/full-title/content/title/''）與 `getTxt` 缺值不产出 `undefined` 字串 |
| 既有 `rag-state`／`tools-unavailable`／`agent-stream` | 零改動 | 收攏點搬遷（決策 #2）後仍綠＝import 不斷的直接證明 |

暖快取指紋（R1：全命中 IDB 啟動無 toast、首次 `semantic_search` 才彈 `🧠 首次載入…`）由 `rag-state` 情境 (6) 持續把關，C1–C3 不改其成立路徑。

---

## 5. 風險與備援

| 風險 | 狀態 | 備援 |
|------|------|------|
| module augmentation 在 `moduleResolution: bundler` 下路徑不可解析 | [未證]（§10.9） | C1 第一支檔案即驗證（typecheck）；失敗→刪 `sdk-augment.d.ts`，`kind.ts` 內單一 `as any` 橋接（集中一處），其餘計畫不變 |
| `full-title` 鍵名 | [未證]（§10.7） | `blockText` 的 `??` 鏈天然退化（title→content→''），不會崩；N9 實測後才定論 |
| 各條 DB datalog | 全部 [未證] | 旗標關＝零執行風險；測試只驗字串契約與映射，不宣稱語意正確；**不自創屬性名**（recycle／property-value 一律不加過濾，留给 N9/N20 count 對照） |
| `:in` 參數化 | 未採納（決策 #5） | N10 後可獨立換 |
| 宿主啟動時 `onCurrentGraphChanged` 若誤觸發一次 | 序列化設計下會多一轮同步 | 第二輪暖快取近乎免費；N21 觀察觸發次數，必要時再加 graphKey 相同短路（現在不加） |
| 關鍵診斷被 `import.meta.env.DEV` 拔掉 | 既有事實 | 夜版判讀依賴的訊號全部走 `logger.error` 或 `showMsg`；`logger.info` 僅留非關鍵日誌 |

---

## 6. §4.9 驗收對照

| 條款 | 滿足方式 |
|------|----------|
| File 快照與 v0.10.1 逐字一致（含 getTxt） | C1/C2：既有 5 鍵零 diff ＋ 第 6 鍵補錄；`git diff v0.10.1 -- tests/__snapshots__` 審查只增不減 |
| DB(fake)：查詢含 `:block/title` 無 `:block/content`、映射正確、旗標關＝Phase 0 | C1：`graph-db.test.ts` 字串契約斷言 ＋ `rag-state(2)`／`tools-unavailable` DB 情境原樣綠 |
| 競態測試通過 | C3：`rag-race.test.ts` |
| typecheck／test／build 綠 | 每個 commit 推送前全跑；C4 後最終全綠 |
| 夜版 N0–N17 全過才翻旗標 | 本交付**不翻**、不打 tag、不動 marketplace（§8 順序）；實測環境見附錄 A |

---

## 附錄 A｜實測環境決策（2026-10-11 補記，偏離來源計畫 §7 措辭）

來源計畫 §7／N0 寫「安裝 DB 版**夜版**」，實測改以 **Desktop APP 2.0.2 (Beta Testing)**（tag `2.0.2`，commit `533ac43`，2026-10-07）為**主要目標**，nightly 降為分診用途。理由：

1. **忠實度**：DB 使用者實際跑 2.0.x beta；N3–N6（側欄掛載，最脆弱一組）照 nightly 測會追到使用者根本不存在的宿主回歸。
2. **可重現**：nightly 每日變動（`d24abc9`@10-10），N9 count／N12 巢狀結構的異常無法區分是外掛還是宿主改動。beta 釘死在 `533ac43`。
3. **正中依賴面**：2.0.2 changelog 明列 improved「**plugin APIs**」——本計畫全盤依賴 `datascriptQuery`／`getPageBlocksTree`／`getBlock`／`checkCurrentIsDbGraph`。
4. **marketplace 佐證**：§8 第 3 條的 `supportsDB: true` PR 應引用發行版本，而非滾動 tag。

nightly 保留單一用途：beta 測出問題時，確認是否已在上游修復（來源計畫的 S1/S2/S3/S6/S8 讀自 master，nightly 是唯一能逐行對上的建置），避免為一個將消失的 bug 寫繞路碼。

**N1 提前為總閘**：裝好後先跑 `getInfo()`（須 `supportDb: true`）＋`checkCurrentIsDbGraph()`（須 `true`），再建 N0 測試圖。N1 不過則 N0–N17 全無意義（探測路徑會直接判 file）。測試報告首行須記 `2.0.2 / 533ac43`。

**旗標語義不變**：硬性約束「§7 夜版 N0–N17 全過才翻旗標」中的「夜版」依本附錄解讀為「真實 DB 版宿主建置」，即以 2.0.2 beta 為準；如需嚴格照字面，則 beta 為主、nightly 複測同一張清單。

### A.1 實測定論（2026-10-11，四輪診斷時間軸，commit `1a8dcba`）

**宿主事實（取代原假設）**：2.0.2 beta 上 `logseq.App.getInfo()` **未回 `supportDb: true`**（候選成因：宿主實作差異 或 SDK 0.0.17 快取了早期不完整物件——無法從外部區分，也無需區分）。後果：

1. **能力閘路徑在 2.0.2 上不成立**：`probeGraphKind` 恆在第一步判 `'file'`，`checkCurrentIsDbGraph()` **從未被本外掛呼叫**——它的行為在此宿主上仍是 [未證]。N1 的原始定義（两個 API 都回預期值）改由**手動 console 驗證**補齊：DevTools 切外掛 iframe context，執行 `await logseq.App.getInfo()` 與 `await logseq.App.checkCurrentIsDbGraph()`，把結果記下來。
2. **DB 圖譜的識別完全依賴 schema 指紋備援**：`schema-mismatch` 異常點 → `fingerprintGraphKind()`（`:block/title` 有列＋`:block/content` 全無 → db）→ 改寫 kind 快取 → 重走守衛路徑。實測指紋：`title=2780 content=0`。
3. **啟動時序**：同步開始時 kind 快取仍是 `file`（指紋尚未跑）；啟動首輪同步完成指紋改判後，所有工具守衛才正確。窄窗口內 `graph_tag_search`/`global_keyword_search` 會走 file 查詢（DB 圖上回零結果字串而非 `GRAPH_TYPE_UNSUPPORTED`），`pageDisplayName` 走 file 語意（DB 實體無 `originalName` → 退回 lowercase `name`）。**N7 必須在啟動同步完成後再測**；此窗口是否值得收窄（例如 tools 守衛也走一次指紋）留給判讀會決定。
4. **已驗證通過**：N1（指紋路徑）、N21（`graph-switch-skip` 生效、啟動補發事件 ~371ms 實測確認、`switches=0`）、worker-retry（階段①無 ❌）、canary＋指紋的組合（`schema-mismatch` 不再是終態誤報）。
5. **db-worker 三階段模型修正**：階段①（查詢丟錯 `db-worker has not been initialized`）實測確認；階段②（全零不丟錯）**未被實測證明存在**——第三輪的 `probe-ambiguous` 缺席其實只證明指紋沒跑到（閘未開），與階段②無關。全零 → null 不寫快取的設計仍保留（防御性，零成本）。
