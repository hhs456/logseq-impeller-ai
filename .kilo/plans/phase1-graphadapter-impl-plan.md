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

### A.2 第一趟（旗標關）實測結果（2026-10-11，2.0.2 beta，圖＝生活日誌 2780 區塊）

| # | 結果 | 備註 |
|---|---|---|
| N1 | ✅ | 指紋路徑：`title=2780 content=0` → 改判 db → `db-adapter-disabled` |
| N2 | ✅ | 工具列＋首次點擊正常 |
| **N3** | ❌ | **S8**：未關面板先關側欄 → 需點兩次。`isVisible` 與被 React 卸載的 DOM 失去同步 |
| **N4** | ❌ | **S8**：快捷鍵關側欄再開 → 面板不在。React 重建 `.sidebar-item-list`，provideUI 模板未重注入 |
| N5 | ✅ | 面板不被清、不重複 |
| N6 | ✅ | 寬度／折疊／主題正常 |
| N7 | ✅ | chat header 大小寫保留（指紋改判後 kind=db → `pageDisplayName` 取 title） |
| N8 | ✅ | 行為面：agent 知所屬頁（`buildPageContextPrompt` 取到正確 page uuid） |
| N15 | ✅ | 導航正常、不創空白頁 |
| **N16** | ⚠️ | 本版本內重啟歷史在＝過；「舊版歷史不在」＝**跨版本 graph.path 漂移**（`memory.ts` key=f(currentGraphPath)，Phase 1 未動此路徑）→ 舊資料孤兒化於舊 key，**未刪除、可恢復**。屬禁碰範圍 |
| N17 | 併入第二趟 | 旗標關時 B 圖 semantic_search 本就回 UNSUPPORTED，測不到污染；污染檢查需旗標開（第二趟）。旗標關的「世代作廢」機制已由 `rag-race.test.ts` 6 情境單元覆蓋 |

**結論**：DB adapter 行為面（N1／N21／worker-retry／canary＋指紋）全綠。N3／N4 為計畫預告的 S8 側欄問題、N16 為宿主 graph.path 穩定性——兩者皆**非 Phase 1 回歸、皆在禁碰檔案（UI／memory.ts）**，轉獨立任務，不阻斷第二趟。

**待辦（範圍外，另開任務）**：
1. 側欄改用官方 sidebar renderer（`logseq.API` 的 `:plugin` block-type / `get-hosted-renderers`），取代 `provideUI` 硬塞——解 N3／N4。
2. `graph.path` 跨版本穩定性調查＋可能的聊天遷移——解 N16「舊版不在」。

### A.3 第二趟（旗標開，本地）實測結果（2026-10-11，2.0.2 beta，圖＝生活日誌，1684 可索引區塊）

> 旗標僅在工作區翻開測試，測畢已還原；HEAD 全程 `false`，未產生任何提交。

| # | 結果 | 證據 |
|---|---|---|
| N1 | ✅ | 首輪同步即見 `probe-fingerprint title=2780 content=0` → `probe-reclassify → db` |
| N9 count | ✅ | `hostCount:1684 == pluginBlockCount:1684`，**完全相符、無膨脹** |
| N9 解析 | ✅ | P5：`full-title` = `引用 [[ZZTest Apple]] 與 #ZZCompany 的區塊`——**可讀名**，datalog＋refs pull 路徑乾淨 |
| N10 tags 支 | ✅ | `#ZZCompany` 被 `[?b :block/tags ?p]` 分支抓回（`(or refs tags)` 兩支皆有效） |
| N10 同名頁 | N/A | 2.0.2 宿主**建不出同名頁**；查詢寫法對未來開放時仍正確，不追 nightly |
| N11 | ✅（帶已知限制） | P6b：純文字 `事件系統`=1、`家長會談`=2、含連結的 `ZZTest`=null → `includes?` **正常**；漏掉「只以連結顯示名出現」的文字＝§4.3 預告限制，非缺陷 |
| N12 結構 | ✅ | array:true、缺頁→null、節點含 uuid/content/fullTitle |
| N12 巢狀 | ✅ | NEST2：`parents:408`、該頁 `roots:3 / total:28` → 25 個子孫正確嵌套，**未壓平** |
| N13 | ✅ | 區塊 uuid → 回文；**頁面 uuid → null**（計畫預期），tools 該說「是頁面」 |
| **N14** | **❌** | P9：`raw-has-uuid-link:true`。**根因**：Editor API 的 `fullTitle` 對連結**保留 raw `[[uuid]]`**，不像 datalog 的 `full-title`（refs pull）會解析。受影響＝頁面上下文（`agent.ts`）、`get_page_outline` 預覽、`read_target_block` 全文——凡含連結的區塊 |
| N15 | ✅ | 導航正常、不創空白頁 |
| N16 | ✅／⚠️ | 本版內重啟歷史在；跨版本（0.10.x→2.0.2）舊聊天孤兒化於舊 `graph.path` key，**未刪除** |
| N17 | 裁定跳過 | 暖快取同步過快抓不到 supersession；採 `rag-race.test.ts` 六情境 CI 證據＋N21 實機閘證據 |
| N20 | ❌（不在閘內） | P10：刪頁後 `["ZZTest Trash"]` 仍被查到 → recycle 區塊混入索引。§8 閘只鎖 N0–N17，故不阻斷發版；**不自創屬性名**，待有正確屬性後再修 |

**N14 的定位（重要，供決策）**：對 DB 使用者而言，v0.11.0-flag-on 仍**嚴格優於** v0.10.1——三個 datalog 工具從「完全不能用」變成可用且索引乾淨，頁面上下文噪音與 v0.10.1 相同（未回歸）。但照 §7 字面 N14 未過，翻旗標與否需用戶裁定。

**修復選項**：
- **(a) 先發版、另開任務修**：接受噪音（僅含連結的區塊受影響，純文字區塊乾淨）。
- **(b) 修後再發版（建議）**：`db.ts` 的 `pageTree`/`blockTree` 維持 Editor API 取**結構**，另以**一條已驗證的 refs-pull 查詢**取該頁所有區塊的 `full-title`，建 uuid→可讀名 map，走樹取代 `text`。成本：每次工具呼叫多 1–2 條查詢（工具頻率低，非熱路徑）；**复用今晚已實證的查詢形狀**（P5／P3），不新增 [未證] 屬性面。純 JS 樹走代，可單元測試覆蓋。
- **(c) 改走 datalog 重構樹**：需 `:block/parent`／`:block/order` 等**未驗證**欄位，擴大 [未證] 面，發版前不宜。

### A.4 N14 修復實測（2026-10-11，commit `abdfebf`，bundle `main-zn4b0p0q.js`）

採方案 (b) 變體（不按頁綁定、免第二輪夜版）：`db.ts` 維持 Editor API 取結構，另以一條 map 查詢（`:block/refs`＋`:block/uuid`＋`:block/title`，三者今晚皆已實證存在）建 uuid→可讀名，純字串取代。

| 驗項 | 結果 |
|---|---|
| V1 map 查詢真實宿主 | ✅ 770 對，樣本 `["6acb9138-…","他和她的距離"]` 等——被引用實體的 uuid→title 可得 |
| V2 降級痕跡 | ✅ `refFailed: []`，`blockCount: 1684`（與 P3 一致，未受美化查詢影響） |
| V3 agent 頁面相关问答 | ✅ 全可讀名（`[[ZZCompany]]`、`[[ZZTest Apple]]`），無任何 uuid 字串 |
| V4 決定性對照 | 同一區塊：Editor API raw = `引用 [[6acba31d-c594-…` → 大綱輸出 = `引用 [[ZZTest Apple]] 與 #[[ZZCompany]] 的區塊` |

**N14 由 ❌ 轉 ✅。** 附帶觀察：`pageTree` 為 `get_page_outline` 與 `agent.ts` 頁面上下文共用，故此修復同時覆蓋兩者。

**殘留（不阻斷）**：`refTitleMap` 每次工具呼叫多一條全圖 map 查詢（本圖 770 對）。工具頻率低、非熱路徑，可接受；若未來大圖（數萬 refs）顯現成本，加 per-graph 快取即可——代價是失效時機管理，發版前不宜。

### A.5 翻旗標閘最終狀態（N0–N17 ＋ R1）

| 狀態 | 項目 |
|---|---|
| ✅ 實測過 | N1 N2 N5 N6 N7 N8 N9（count＋解析）N10（tags 支）N11 N12（結構＋巢狀）N13 **N14** N15 N16（本版內） |
| 裁定非阻斷 | N3／N4（S8 宿主重繪側欄 DOM，與圖譜類型無關，file 圖在 2.0.2 同樣會中）→ 獨立任務 |
| N/A | N10 同名頁（2.0.2 宿主建不出同名頁）；N17 實機（暖快取抓不到 supersession，採 `rag-race` 六情境 CI 證據＋N21 實機閘證據） |
| 記錄不修 | N20 recycle 混入（不在 N0–N17 閘內；不自創屬性名，待正確屬性實證）；N16 跨版本 graph.path 漂移（memory.ts 禁碰，舊資料孤兒化未刪除） |
| ⚠️ **未實測（裁定跳過）** | **R1**：0.10.x 宿主＋file 圖回歸。見 A.6 |

### A.6 R1 跳過記錄（2026-10-11，用戶裁定）

§7 明文「每個 phase 發版前必跑 R1」。本版**未經真實 0.10.x 宿主實測**即發版，為已知缺口，記錄如下。

**代償證據**（三層，皆非宿主級）：
1. **快照逐字一致**：五個呼叫點＋`getTxt` 基準與 v0.10.1 零 diff（`tests/__snapshots__/file-graph-output.json` 既有 5 鍵未動）。
2. **CI 探測情境**：`tests/graph-kind.test.ts` 兩條专门鎖 R1 形狀——`getInfo()` 無 `supportDb` → 判 file 且**零查詢**、永不觸及 `checkCurrentIsDbGraph`；`getInfo()` resolve 成 `undefined` → 判 file 不丟錯。
3. **181 測試全綠**＋`typecheck`／`build` 綠。

**為何残余風險低**：Phase 1 新增的四條路徑在 file 圖上全部**不執行**——指紋覆核只在 `schema-mismatch` 異常點觸發；`refTitleMap` 只在 `DbGraphAdapter` 內，file 圖永不實例化；`withWorkerRetry` 只在錯誤字串含 `db-worker has not been initialized` 時介入；`diag()` 只寫環形緩衝。唯一在 file 圖上會跑到的是 `main.ts` 啟動閘的一次 `getGraphCacheKey()`（舊 API、已包 try/catch，取不到即放行首個事件）。

**未獲證據的具體主張**：原始需求點名的「暖快取啟動無 toast、`semantic_search` 首次呼叫才彈 `🧠 首次載入…`」在**真實 0.10.x 宿主**上仍然成立——由程式碼推論與 `rag-state` 情境 (6) 單元覆蓋，未經宿主驗證。

**補償動作**：任一 0.10.x 使用者回報 file 圖異常，即以此節為判讀基準；後續若取得舊宿主，補跑 R1 並將本節改為「已實測」。

### A.7 發版順序（2026-10-11 改正）

**先更正一處錯誤指令**：A.5 舊版曾寫「`manifest.json` 必須在打 tag 前改，否則 `publish.yml` 會發出不帶 DB 標記的 zip」——**該說法是錯的**。查證：`publish.yml` 打包 `README.md`＋`package.json`＋`logo.png`＋`dist/`，**不含 `manifest.json`**；外掛身分來自 `package.json` 的 `logseq` 欄位（`id`／`title`／`icon`／`category`）。故 `supportsDB` 與 zip 內容無關，**不存在 tag 順序陷阱**。

`supportsDB` 的真實作用面只有兩個：
- **`logseq/marketplace` 的 listing metadata** —— DB 使用者在 app 內市集看見「支援 DB」標記與篩選的**唯一來源**
- **本 repo 根目錄 `manifest.json`** —— 載入「未封裝外掛」時被 app 讀取（今晚兩趟實測即此路徑），保留是為與 marketplace 同步，非發版必要條件

**順序**：
1. 翻 `DB_ADAPTER_ENABLED=true`（`src/graph/index.ts`）＋ `manifest.json` 加 `"supportsDB": true`（同 commit，維持 repo 內外一致）＋ CHANGELOG 標明 DB 支援啟用與 R1 跳過
2. `typecheck && test && build` 全綠
3. 打 `v0.11.0` tag 並推送 → `publish.yml` 自動建 Release＋zip
4. 送 `logseq/marketplace` PR：改該 repo 內本外掛目錄的 `manifest.json`，加 `"supportsDB": true`；**不加** `supportsDBOnly`、**不加** `unsupportedGraphType`（§8 第 3 條）。`effect: true` 維持原狀（會進較嚴格審查，為既有狀態）
