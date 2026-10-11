# Impeller AI 側欄 UI 修繕 — 實施計畫

> 路徑一律指向 repo 根 `D:\User\Documents\GitHub\logseq-impeller-ai\`。`.kilo/worktrees/` 目前**不存在**（glob 無結果），但實作時所有 grep / 改檔仍須以 repo 根為基準，並排除 `.kilo/`。
> 行號為 2026-10-11 重新對照原始碼的結果；與交接文件不同處標示為 **〔修正〕** 或 **〔新發現〕**。

---

## 0. 複查結論（先讀）

### 0.1 交接文件已逐項驗證為真
`ui.ts:66-70,124-130,134,158,176-204`、`agent.ts:156-169,230-236,248-266`、`actions.ts:91-134`、`engine.ts:20-119`、`prompts.ts:38-55`、`markdown.ts:32-38,69-77`、`components.ts:18,27,88-90,96-111,149-151`、`memory.ts:64-88,106`、`publish.yml:3-6`、`tsconfig.json:7,14`、`package.json:5` / `manifest.json:3` 皆與描述一致。`node_modules` 目前完全不存在（含 `@logseq/libs`、vitest、jsdom）。

### 0.2 〔新發現〕會改變規格的事實

| # | 發現 | 證據 | 影響 |
|---|---|---|---|
| N1 | **DOMPurify 預設 `ALLOW_DATA_ATTR: true`**：任何 `data-*` 屬性不論是否在 `ALLOWED_ATTR` 都會通過。交接 3-B 步驟 1「從 `ALLOWED_ATTR` 移除 `data-on-click`」**本身無效**，`data-on-click` 現在與改完之後都照樣通過。 | `markdown.ts:68-78` 只設 `ALLOWED_TAGS/ALLOWED_ATTR` | 必須加 `ALLOW_DATA_ATTR: false`，並以單元測試鎖定（驗收 #5） |
| N2 | `compressIfNeeded` 把 `agent.ask()` 的回傳字串直接當摘要；而 `ask()` 在中止時**回傳**（非拋出）`abortSummary` 字串。→ 壓縮期間按 Stop，`"🛑 [對話已被使用者終止]"` 被寫入 `chatData.summary` 並持久化；且 `sendMsg` 接著照常執行主 `ask`（Stop 被吞掉）。 | `agent.ts:224` 回傳字串；`memory.ts:114-122` `if (newSummary)`；`agent.ts:258-266` 無中止檢查 | P0-5 比交接描述更嚴重：不只 UI 閃爍，還會污染長期記憶。納入 P3 |
| N3 | `ask()` 的 catch 內「`!state.processingPageUuid`」才推入中止摘要，但 `sendMsg` / `regenerateMsg` 在呼叫前一律已設 `processingPageUuid` → 該分支實質為死碼，中止摘要靠呼叫端 push。 | `agent.ts:215-221` vs `:249,286` | P3 重構時一併移除 |
| N4 | `copyToClipboard` fallback：`execCommand` 回傳 false 時，`try` 內已 `removeChild`（`clipboard.ts:21`），再 `throw`（`:26`）進 `catch` 又 `removeChild`（`:29`）→ `NotFoundError` 逸出，「Copy failed」toast 永遠不顯示。另 fallback 的 `focus()` 搶走焦點且不還原。 | `clipboard.ts:18-32` | P1 修正（交接只寫「clipboard」未給規格） |
| N5 | 每次 `renderUI()`（含**每次切頁**）都會 `textarea.focus()`，即使使用者正在 Logseq 主編輯區打字 → **搶走主編輯器焦點**，不只是 IME / 游標問題。 | `ui.ts:124-130` + `main.ts:256-261` | 驗收新增 #12；修法見 P1 |
| N6 | `handleGraphChange` 把 `state.currentGraphPath`（實體路徑）與 `getGraphPrefix()`（`impeller_chat_…_` 字串）比較 → **恆不相等**，每次都全清 `chatStore`；`await MemoryManager.getAllSavedPages()` 回傳值被丟棄（無作用）。且切圖譜時若 `ask` 進行中，`state.chatStore[targetUuid]` 變 `undefined` → `sendMsg` / `regenerateMsg` 後續 `.msgs` 取值拋 TypeError。 | `actions.ts:66-89`、`agent.ts:269` | 併入 P3「世代號」 |
| N7 | `buildApiPayload` 把 `chatStore` 裡的**整個訊息物件**（含 `timestamp`）送給 provider；嚴格的 OpenAI 相容端點可能 422。若依交接 3-H 把 `role:'tool'` 訊息存回 `chatStore.msgs`，下次請求會送出沒有對應 `assistant.tool_calls` 的 tool 訊息 → **API 400**。 | `memory.ts:90-102`；`agent.ts:179-186` 的 tool 訊息只存在 `currentMessages` | 工具軌跡**不可**復活 `role==='tool'` 分支，改為 UI 專用 `trace` 欄位（見 P6）；`buildApiPayload` 改為只輸出 `{role, content}` |
| N8 | `getAllSavedPages` 的整個迴圈在單一 `try` 內：只要有一筆 key 前綴相符但 JSON 壞掉，**整份清單失敗為空**。新增 index key 時若沿用 `impeller_chat_` 前綴，會被此掃描當成對話而炸掉。 | `memory.ts:64-88` | index key 必須用**不同前綴**（`impeller_idx_`） |
| N9 | `provideModel({...actions, ...agent, ...panel})` 把所有函式（含 `clearChat`、`stopTask`、`resetSettings`、`sendMsg`…）暴露給任何 `data-on-click`。實際只有 toolbar 的 `togglePanel` 需要走 Logseq 路由。 | `main.ts:227-231,236` | P2 縮減為只註冊 `togglePanel`（縱深防禦，即使 sanitizer 日後出錯也只剩一個無害動作） |
| N10 | 勾選清單 `<input type=checkbox>`（GFM task list）靠 `ALLOWED_TAGS` 的 `input` 才能顯示；依 3-B 移除 `input` 會讓任務清單消失。 | `markdown.ts:72,75` | 在 renderer 覆寫 `checkbox` 輸出 `☑/☐` `<span>`（P2） |
| N11 | 預設值 `systemPromptOverride = getStaticPromptParts(...).join()`，而 `buildSystemPrompt` 又再附加 static parts → **提示詞已重複一份**。 | `main.ts:103`、`prompts.ts:30-35` | 不在範圍內，僅記錄；新增靜態句子時無需遷移使用者設定（static 部分永遠會附加） |
| N12 | README 另有與實況不符之處：`README.md:33` 宣稱 AI 輸出 `<span class="logseq-page-ref">`（實際 class 為 `ai-chat-wiki-link`）；`:37,62` 稱「分頁歷史」（實作為橫向 chip 列）；`:41,63` 稱 hover 顯示控制（實作恆顯示，`components.ts:103-113`）。 | 見左 | 納入 P7 文案清單（並對稱 zh-TW） |

### 0.3 對交接文件 C1–C3 的複查
- **C1** 成立：`agent.ts:307-310` 傳 `true`，`engine.ts:7,9` 使用 `t.working`；P1 改文案為中性。
- **C2** 成立並已用 grep 確認：`isWritingToPage:true` 只出現於 `actions.ts:111`。
- **C3** 對**測試環境**成立（jsdom 下 `window.parent === window`）；注意**生產環境相反**：plugin 在 iframe、`provideUI` 注入的是 **host 文件**，所以 `parent.document` 在正式環境是 Logseq 主視窗。這正是 P0 要用 jsdom 模擬而非 mock 的前提，仍需 V3 實測。另 `import '@logseq/libs'` 在 jsdom 下是否有副作用未知 → 新增 V9。

---

## 1. 與交接文件的差異（需使用者知悉的設計決定）

| # | 差異 | 理由 |
|---|---|---|
| D1 | **事件監聽改掛 `parent.document`（capture 階段，只安裝一次，`logseq.beforeunload` 移除）**，以 `closest('#ai-sidebar-container')` 過濾；取代交接 3-C-3 的「rAF/MutationObserver 重試」與 3-C-4 的「掛在 container」。 | 完全不依賴 DOM 何時掛載 → V2 的 race 與驗收 #3（慢速 DOM）從設計上消失；也不需「冪等化旗標」。若 V1 顯示 Logseq 在 capture 前就吞事件，退回交接方案。 |
| D2 | **模型內容區（`.ai-bubble-content`）完全不放 `data-*` 動作屬性**：只保留 `data-ai-page`（僅限 `a.ai-chat-wiki-link`）；Copy 鈕不再帶 `data-code`，改為點擊時讀取同一 `.ai-code-block` 內 `<code>.textContent`。動作路由分兩區：**bubble 內只認 `openPage`、`copyCode` 兩種 class**；bubble 外（我方受信模板）才認 `data-ai-act` allowlist。 | 比交接 3-B 更嚴：即使模型輸出 `data-ai-act="deleteMsg"`，會在 sanitize 被剝除（N1 修正後），即使漏網也在 bubble 區被路由忽略（兩層）。`textContent` 方案同時保證驗收 #6「Copy 與原文逐字相同」，並省掉 URL 編碼導致的屬性膨脹。 |
| D3 | `((block-ref))` **不做**（只做 `[[page|alias]]`）。 | 需要新增 allowlist 動作 + `getBlock` 解析 + 側欄開啟行為，擴大攻擊面且無使用者需求證據。 |
| D4 | `[[ ]]` marked extension **提前到 P2**（原 P4）。 | P2 本來就要重寫 `markdown.ts:32-38` 的屬性名；先改屬性再改 extension 是同一段程式碼白工兩次。 |
| D5 | a11y 的**語義元素 / aria-label / role** 隨 P5 樣式遷移一併做（原 P7）；P7 只留對比度稽核、focus ring、Esc、驗證。 | P5 會整份重寫 `components.ts` 模板，之後再動一次是重工。 |
| D6 | **不**對氣泡區設 `aria-live="polite"`；改用一個視覺隱藏的獨立 status 區，僅在「開始思考 / 回答完成 / 已中止 / 錯誤」四個節點更新文字。 | 串流（P6）每個 delta 都會改氣泡內容，`aria-live` 會逐字朗讀（交接 3-G 自己也承認這是 Tier 2 災難）；單獨 status 區零成本避開。 |
| D7 | 工具軌跡用 `ChatMessage.trace?: ToolTraceEntry[]`（UI 專用，不送 API、不進摘要），**刪除** `components.ts:88-90` 的 `role==='tool'` 分支而非復活。 | N7。 |
| D8 | 孤兒 key 淘汰（交接 3-I）**降級**：不做自動刪除；僅新增命令面板項「Impeller AI: 清理其他圖譜的對話紀錄」，列出數量並 `confirm`。 | 自動刪除 localStorage 是不可逆資料損失，且「路徑改變」與「使用者換機」難以區分。 |
| D9 | **串流保留在範圍內，但設 kill switch**：新增設定 `enableStreaming`（預設 `true`），並實作「`stream:true` 被 4xx 拒絕時自動以非串流重試一次」。 | OpenAI 的部分推理模型串流需組織驗證，會直接 400；Ollama/LM Studio 多數 OK。無此降級路徑風險過高。 |
| D10 | 訊息級差分以**渲染結果 memoize（`Map<content, html>`，LRU 約 200 筆）**為主，不先做 DOM keyed diff。V6 若證明不夠再升級。 | `renderMarkdown`（marked + DOMPurify）是 `buildChatHistory` 每次 render 的主要 CPU 成本；memoize 一次解決，且不改變 Stage B「整段替換 history」的既有行為與捲動防禦。 |

---

## 2. Phase 0 — Spike 與基礎設施

**目標**：用事實推翻或確認規格；先讓 CI 與測試能跑。Phase 0 的**唯一程式碼產出**是測試基礎設施與 spike 暫時性修改（spike 修改**不得提交**）。

### 2.1 Spike 清單（含新增 V7–V9）

| # | 題目 | 方法 | 若結果為… |
|---|---|---|---|
| V1 | Logseq 的 `data-on-click` 路由是否作用於 `provideUI` 注入、且之後被 `innerHTML` 替換的 DOM？`stopPropagation` 掛在 `#ai-sidebar-history-wrapper` 是否真能阻止它（現行 `ui.ts:182-183` 即依賴此）？capture 階段的 `parent.document` 監聽是否先於 Logseq？ | 暫時在 history 內注入 `<button data-on-click="clearChat">`，點擊；再於 capture 監聽 `stopPropagation` 重試 | **會路由** → 安全問題為真，D2 / N9 優先級最高，且不得遺留任何雙軌（會重複執行）。**不會路由** → 安全風險降級，但 D2 照做（成本低）。**capture 無效** → 退回交接 3-C-4（掛 container） |
| V2 | 事件綁定 race 可否重現 | `ui.ts:66` 的 `100`→`3000` | 驗證 D1 的必要性；不可重現也照做 D1（它同時簡化程式碼） |
| V3 | jsdom `window.parent === window`；`parent.document.getElementById` 可直接用 | 一行 vitest smoke | 否 → 測試需 stub `parent`（先別動 `src`，用 `Object.defineProperty(window,'parent',…)`） |
| V4 | `html[data-theme]` / `.dark-theme` 實際存在層級 | DevTools 於深淺主題各取 `documentElement.className` 與 `dataset.theme` | 決定 P5 高亮主題選擇器與是否保留亮度兜底 |
| V5 | 並發窗口可重現 | `memory.ts:106` `THRESHOLD`→`2` | 同時驗證 N2（摘要被污染） |
| V6 | 基準：50 份對話 × 30 訊息，一次 7 工具迭代的 render 總耗時 | `performance.now()` 包 `renderUI`，記錄次數與總耗時 | 驗收 #8 基線；寫入 findings |
| V7 | 模型輸出 `<a href="https://…">` 點擊在 Logseq host DOM 的行為（開啟外部瀏覽器？導航掉整個 Logseq 視窗？）；`logseq.App.openExternalLink` 是否存在 | 手動點擊 + 型別檢查 | 若會導航視窗 → P2 在 delegate 攔截 `a[href]` 並改走 `openExternalLink`（僅允許 `http(s)`、`mailto`） |
| V8 | `.sidebar-item-list` 祖先鏈有無確定高度（決定 `height:100%` 能否取代 `calc(100vh - 100px)`） | DevTools 逐層看 computed height / overflow | 否 → P5 保留 `calc()` 並以 CSS 變數集中管理，改用 `100dvh` |
| V9 | `import '@logseq/libs'` 在 vitest/jsdom 下有無副作用或拋錯 | 於 setup 先 `vi.mock('@logseq/libs', () => ({}))` 對照不 mock | 決定 setup 是否必須 mock（預設 mock） |

**交付物**：`.kilo/plans/phase0-findings.md`（「事實 vs 推測」對照表，每題一行：預期 / 實測 / 對後續規格的影響）。**任何規格被推翻 → 先改本檔再動 Phase 1。**

### 2.2 測試與 CI 基礎設施（Phase 0 必須落地）

1. `package.json`：devDependencies 新增 `vitest`、`jsdom`；scripts 新增 `"test": "vitest run"`、`"typecheck": "tsc -p tsconfig.test.json --noEmit"`。**同時更新 `package-lock.json`**（CI 用 lock）。
2. `vitest.config.ts`（獨立於 `vite.config.ts`，不影響 build）：`environment: 'jsdom'`、`setupFiles: ['tests/setup.ts']`、`include: ['tests/**/*.test.ts']`。
3. `tests/setup.ts`：`vi.mock('@logseq/libs', () => ({}))`；建立 `globalThis.logseq` 假物件（`provideUI/provideStyle/provideModel/settings/UI.showMsg/App/Editor/DB/updateSettings/beforeunload`）。`provideUI` 的假實作把 `template` 塞進 `#right-sidebar .sidebar-item-list`（測試開頭先建好此節點）→ 可端到端測 Stage A/B。
4. `tsconfig.test.json`：`extends ./tsconfig.json`，`include: ["src","tests"]`，`types: ["vitest/globals"]`。**`tsconfig.json` 不動**（`include:["src"]` 維持，build 不被測試拖累）。
5. `.github/workflows/ci.yml`（**新檔**，不動 `publish.yml`）：`on: [push(branches), pull_request]`；Node 24；`npm ci` → `npm run typecheck` → `npm test` → `npm run build`。
6. `publish.yml`：只在 `npm run build` 前加一行 `npm test`（避免 tag 發佈跳過測試）；不改其他步驟。
7. `tests/smoke.test.ts`：V3 的斷言；`renderMarkdown` 基本案例（作為後續回歸起點）。

**可獨立合併**：是（僅新增檔案 + package.json/lock）。**風險**：低。**驗收**：#10 的基礎。

---

## 3. Phase 1 — 止血與 formatPage 徹底移除

可獨立合併性：分成 4 個 commit（1a–1d），各自可 revert。

### 1a. formatPage 引用圖與刪除（3-A）

**動工前輸出的引用圖（已核實）**：

```
actions.formatPage (actions.ts:91-134)
 ├─ writeToLogseq ── engine.ts:20-119 ── logseq.settings.tag ── main.ts:78-83（設定項）
 │                                     └─ state.t.tagDefault ── i18n.ts:15,66 ── actions.ts:178(resetSettings)
 ├─ buildSystemPrompt({isWritingToPage:true,baseCondition,instruction}) ── prompts.ts:4-9,38-55
 │     └─ state.t.baseCondition / applyReformat / applyContext ── i18n.ts:4-6,55-57
 ├─ state.t.done ── i18n.ts:10,61
 └─ getTxt（仍被 agent.ts:26 與 tools.ts 使用 → 保留）
provideModel({...actions}) ── main.ts:227 （自動少一個，不需改）
無任何 UI 模板引用 formatPage（components.ts 無 data-on-click="formatPage"）
死鍵（已無任何引用，可一併刪）：applyBtn、stopBtn、clearBtn、settingResetDesc
```

**刪除 / 修改**（每項附驗證）：

| 項目 | 動作 |
|---|---|
| `actions.ts:91-134` `formatPage`；`:4` import `writeToLogseq`；`:5` `getTxt`；`:7` `buildSystemPrompt`（僅保留 `getStaticPromptParts`）；`:9` `agent`（若不再使用）；`:178` `tag:` | 刪除 |
| `engine.ts:20-119` | 刪除；檔案只剩 busy feedback。**改名 `src/busyFeedback.ts`** 並更新 `agent.ts:4` import |
| `prompts.ts` | `PromptOptions` 只留 `langName`；刪 `:38-55`；`agent.ts:23` 改為 `buildSystemPrompt({ langName: state.t.langName })` |
| `main.ts:77-83` | 刪 `tag` 設定項。舊使用者 settings 殘留 `tag` 鍵：無害，CHANGELOG 註明 |
| `i18n.ts`（**兩語系**） | 刪 `baseCondition, applyReformat, applyContext, done, stopBtn, applyBtn, clearBtn, tagDefault, settingTagDesc, settingResetDesc`；`welcome` 改為 zh：「🤖 AI 助理已就緒，可以開始對話。」／ en：「🤖 AI Assistant ready. Start chatting.」；`working` 改為中性：zh「⏳ AI 正在處理中，請稍候…」／ en「⏳ AI is working…」（修 C1） |
| `package.json:5`、`manifest.json:3` description | 移除 "smart 'Apply' logic for refactoring or appending ideas"，改述實際功能（側欄對話、RAG 工具、網路搜尋、中止） |
| `img/screenshot_format.jpg`、`SCREENSHOTS.md:4,6` | 刪圖並重排表格（改放 `screenshot_copy.jpg` 單欄或補其他現有截圖，先 `Glob img/*` 確認） |
| `README.md:40,68`、`README.zh-TW.md:40,68` | 刪「智慧套用 / Format」條目（其餘文案同步留到 P7） |
| `CHANGELOG.md` | 新增 Unreleased：Removed（Apply/Format、`tag` 設定）、Changed（`working` 文案） |

**靜態提示詞新增**（`prompts.ts:15-23` `getStaticPromptParts`，保留原先 §5 的「語意」並**軟化**）：

> `### 4. WIKI-LINKS\nWhen you mention a person, project, or concept that is likely to exist as a page in the user's notes, you MAY wrap it in [[double square brackets]]. Do not link common words. Never put [[ ]] inside code blocks.`

理由：原 §5 要求「自動識別並包裹所有重要實體」，但模型不知道頁面是否存在，而 `openPage` 對不存在頁面只彈警告（`actions.ts:157-161`）；軟化後雜訊較低。README:33 改為「聊天回覆可含可點擊的 `[[雙向連結]]`」。

**完成條件（grep gate，兩語系）**：`formatPage|writeToLogseq|parseMarkdownToTree|isWritingToPage|baseCondition|tagDefault|applyReformat|applyContext|settingTagDesc|settingResetDesc|applyBtn|stopBtn|clearBtn|t\.done` 在 `src/ README* SCREENSHOTS.md manifest.json package.json` 為 0 筆（`CHANGELOG.md` 歷史條目除外）。`npm run typecheck` 通過（`I18NKey` 為 `as const` 推導，漏刪會在此爆出）。
**風險**：中（刪除面廣）；以 grep gate + tsc 兜底。

### 1b. IME 與焦點（3-C-1/2，含 N5）

- `ui.ts:158`（`onkeydown`）→ 改為 P2 的 delegate 前，先在原處最前面加 `if (e.isComposing || e.keyCode === 229) return;`（P2 搬移時保留此行與測試）。
- 刪除 `ui.ts:124-130` 的每次 render `focus()` + `setSelectionRange()`。
- 新增 `focusTextareaIfAppropriate()`（`ui.ts`）：僅在 (a) 剛由 busy→idle，且 (b) `parent.document.activeElement` 為 `body`/`null` 或位於 `#ai-sidebar-container` 內，且 (c) `getSelection().isCollapsed` 時才 `focus()`；**不**呼叫 `setSelectionRange`（讓瀏覽器保留游標）。初次掛載聚焦保留一次（見 P2 的「掛載後一次性聚焦」）。
- **測試**：jsdom 中對 textarea 派發 `compositionstart` → `keydown{key:'Enter',isComposing:true}` 不呼叫 `sendMsg`；在 textarea 設 `selectionStart=2` 後 `renderUI()`，`selectionStart` 不變；`activeElement` 為另一個 contenteditable 時 `renderUI()` 不改變 `activeElement`。

### 1c. 剪貼簿（N4）

`clipboard.ts` 改寫 fallback：單一 `finally` 負責 `removeChild`（先判斷 `isConnected`）；`execCommand` false 直接走失敗 toast；記錄 `previousActive = document.activeElement`，結束後 `previousActive?.focus()`。
**測試**：`navigator.clipboard.writeText` reject + `execCommand` 回 false → 呼叫 `showMsg('❌ Copy failed','error')` 且不拋出；DOM 無殘留 textarea。

### 1d. Busy toast 文案（C1）

已由 1a 的 `working` 改文案完成；另在 `busyFeedback.ts` 把 4 秒輪詢 toast 改為**僅於 `regenerateMsg` 路徑**觸發的同一行為（維持現狀，不擴張）。**不**改 `startBusyFeedback` 簽名。

**P1 驗收映射**：#1（IME/游標）、#11（文案）、#12（不搶主編輯器焦點，新增）。

---

## 4. Phase 2 — 事件管線與安全

可獨立合併性：2a（markdown 安全）與 2b（事件管線）互相**有相依**（屬性名），建議同一個 PR、兩個 commit，不可只合其一。**風險：高**（觸及所有互動）。

### 2a. `markdown.ts` 重寫（3-B + D2/D3/D4 + N1/N10）

1. **sanitize 設定**：`ALLOW_DATA_ATTR: false`；`ALLOWED_TAGS` 移除 `button`、`input`；`ALLOWED_ATTR = ['href','target','class','data-ai-page']`（**不含** `data-ai-act`、`data-ai-code`）。
2. `afterSanitizeAttributes` hook（模組載入時註冊一次，避免重複註冊）：
   - 移除任何非 `a.ai-chat-wiki-link` 元素上的 `data-ai-page`；
   - `a[target]` 一律 `rel="noopener noreferrer"`；`data-ai-page` 超過 `MAX_PAGE_NAME = 200` 字元則整個移除（沿用 `tools.ts:9` 量級的思路）；
   - 對 `.ai-copy-code-btn`、`.ai-chat-wiki-link` 補 `role="button"` / `tabindex="0"`（hook 內加入的屬性不再被 sanitize 重審）。
3. **Copy 鈕**：`renderer.code`（`:44-58`）輸出 `<div class="ai-code-block"><span class="ai-copy-code-btn">📋 Copy</span><pre><code class="language-x">…</code></pre></div>`，**無** `data-code`。
4. **`[[ ]]` extension**：`marked.use({ extensions: [{ name:'wikilink', level:'inline', start(src){return src.indexOf('[[')}, tokenizer(src){ const m=/^\[\[([^\[\]\n|]{1,200})(?:\|([^\[\]\n]{1,200}))?\]\]/.exec(src); … }, renderer(tok){ …escapeHTML… } }] })`。刪除 `:32-38` 的預處理。inline 層級不會進入 code span / code block → 修正 `t[[1]]` 問題（驗收 #6）。輸出：`<a class="ai-chat-wiki-link" data-ai-page="${escapeHTML(page)}">[[${escapeHTML(label)}]]</a>`。
5. **task list**（N10）：覆寫 `renderer.checkbox` 輸出 `<span class="ai-task-box">☑</span>` / `☐`。
6. `marked` 使用 `new Marked()` 實例而非全域 `marked.use`（避免與其他模組互相污染，且利於測試）。
7. **memoize（D10）**：`Map<string,string>` 以原文為 key，容量 200，命中時搬到末端；`export function clearMarkdownCache()` 供測試。

**測試（`tests/markdown.test.ts`）**：
- 輸入含 `<button data-on-click="clearChat">x</button>` → 輸出不含 `button`、不含 `data-on-click`。
- `<a data-on-click="openPage" data-page-name="X">` → 兩屬性皆被剝除。
- `<span data-ai-act="deleteMsg" data-index="0">` → `data-ai-act`、`data-index` 皆被剝除（N1 回歸）。
- `<span data-ai-page="X">` → `data-ai-page` 被 hook 剝除（非 wiki-link）。
- ```` ```lua\nlocal x = t[[1]]\n``` ```` → code 內文逐字存在，無 `ai-chat-wiki-link`。
- `[[Page|別名]]` → `data-ai-page="Page"`、顯示 `[[別名]]`；`[[<img onerror=1>]]` → 已跳脫。
- `- [x] done` → 無 `<input>`，有 `ai-task-box`。
- `javascript:` href → 被剝除（DOMPurify 預設）。

### 2b. 事件管線（3-C-3/4/5 + D1 + N9）

1. 新增 `src/ui/events.ts`：`installEventDelegation()` / `uninstallEventDelegation()`。對 `parent.document` 註冊 `click`、`keydown`、`input`（capture=true），第一行 `const root = (e.target as Element).closest?.('#ai-sidebar-container'); if (!root) return;`。`main.ts` 於 `main()` 呼叫一次並在 `logseq.beforeunload` 呼叫 uninstall。
2. **路由表**（單一來源 `ACTIONS: Record<string, Handler>`）：`toggleCollapse, hidePanel, resetSettings, toggleMemoryCollapse, clearChat, exportChat, sendMsg, stopTask, openPage, copyMsg, regenerateMsg, deleteMsg`。
   - 目標元素在 `.ai-bubble-content` 內 → 只處理 `.ai-chat-wiki-link`（→`openPage`，頁名取 `data-ai-page`）與 `.ai-copy-code-btn`（→`copyCode`，字串取同層 `.ai-code-block code` 的 `textContent`）。其餘一律 `return`（**不** `preventDefault`，保留文字選取與一般連結）。
   - 目標在 bubble 外 → `closest('[data-ai-act]')`，**不在 `ACTIONS` 內的值一律 return**；命中後 `preventDefault()` + `stopPropagation()`（避免若 V1 為真時被 Logseq 再路由一次）。
   - `a[href^="http"]` 於 bubble 內：依 V7 結果 `preventDefault()` 並以 `openExternalLink` 開啟（或維持預設）。
3. **鍵盤**（textarea）：`isComposing || keyCode===229` → return；`Enter && !shiftKey && !isBusy` → `preventDefault(); agent.sendMsg()`（**直接呼叫**，取代 `querySelector('[data-on-click="sendMsg"]').click()`）；`Escape && isBusy` → `agent.stopTask()`；`ArrowUp/Down/Enter` 繼續 `stopPropagation()`（沿用 `ui.ts:159` 行為，避免 Logseq 快捷鍵）。
4. **`input` 事件**更新 `state.drafts[currentPageUuid]`（見 P3 的 per-page draft；P2 先沿用 `state.tempInput`）。
5. **模板**：`components.ts` 所有 `data-on-click` → `data-ai-act`（`:11,17,18,36,47,104,105,111,139,140,149,150`）、頁名 `data-page-name` → `data-ai-page`；Send 鈕加 `id="ai-sidebar-send"`（`:151`）並讓 `ui.ts:134` 改用 `#ai-sidebar-send`；`ui.ts:136-146` 切換 Send/Stop 時只改 `data-ai-act`、文字與 class（不再用 inline style，順帶消除 `opacity:0.9` 殘留 → P1-4）。
6. **textarea 初值**：模板直接輸出 `<textarea>${escapeHTML(draft)}</textarea>`，**刪除** `setupStaticEventListeners` 與 `ui.ts:66-70` 的 `setTimeout`；初次掛載聚焦以「有限輪詢」`for ≤ 20 次 × 100ms 找到 textarea 就 focus 一次」實作。
7. **provideModel 縮減**（N9）：`main.ts:227-231` → `logseq.provideModel({ togglePanel: panel.togglePanel })`。`togglePanel` 內部使用 `state`，不依賴 `this`。
8. `ui.ts` 與 `actions/panel/agent` 的循環 import：`events.ts` 直接 import 這些模組，`ui.ts` 不再 import `actions/panel/agent`（打破 `ui.ts ↔ …` 環）。

**測試（`tests/events.test.ts`，jsdom + logseq-mock）**：
- 掛載延遲 2 秒（先 `renderUI()` 但 `provideUI` 假實作延遲注入）後點擊 `data-ai-act="sendMsg"` 仍觸發（驗收 #3）。
- bubble 內的 `data-ai-act="deleteMsg"`（手動以 `innerHTML` 繞過 sanitize 注入）點擊 → **不**呼叫 `panel.deleteMsg`（驗收 #5 第二層）。
- `ACTIONS` 之外的 `data-ai-act="evil"` → 無任何呼叫。
- `renderUI()` 連續呼叫 N 次，`document` 上 click 監聽數不增加（用 spy 包 `addEventListener` 計數，只應有安裝時的 3 次）。
- IME、Esc、Enter 三條鍵盤路徑。

**風險**：高。回滾策略：2a/2b 同 PR 兩 commit，revert 整個 PR。

**P2 驗收映射**：#3、#5、#6（部分，高亮在 P5）。

---

## 5. Phase 3 — 狀態機、世代號、逾時

可獨立合併：是（僅動 `agent.ts / memory.ts / actions.ts / config.ts / types.ts / panel.ts`；P2 已落地所以不會與委派重構衝突）。**風險：中高**。

### 3a. Run 抽象（P0-5、N2、N3）

- 新增 `state.run: { id:number; pageUuid:string; controller:AbortController } | null`；`state.isBusy` 保留為相容欄位，**只由 `withRun()` 設定**。
- 把 `ask()` 拆成：
  - `runCompletion(messages, { signal, onDelta?, onToolEvent? }): Promise<{status:'ok'|'aborted'|'error'; content:string|null; trace:ToolTraceEntry[]}>` — 不碰 `isBusy`/`abortController`/`processingPageUuid`/`renderUI`。
  - `withRun(pageUuid, { notify }, fn)` — 設定/清除 `state.run`、`processingPageUuid`、busy feedback、**僅在最外層**呼叫 `renderUI()`。
- `sendMsg`：`withRun` 包住「壓縮 + 主請求」兩段，共用同一個 `controller.signal`。壓縮回傳 `aborted` → **立即結束**，不寫摘要、不發主請求（N2）；`compressIfNeeded` 簽名改為 `(uuid, caller) => Promise<'ok'|'aborted'|'skipped'>`，只在 `status==='ok'` 時寫 `summary`。
- `stopTask()` → `state.run?.controller.abort()`。
- 刪除 `previousAbortController`（`agent.ts:108,232`）與死分支（N3）。
- 中止摘要的 push 統一由 `sendMsg`/`regenerateMsg` 完成（單一路徑）。

### 3b. 世代號與頁面切換（3-I「切頁 race」、N6）

- `updatePageContext` 開頭 `const gen = ++state.contextGen;`，每個 `await` 之後檢查 `if (gen !== state.contextGen) return;`，才允許寫 `currentPageUuid/chatStore`。
- `onRouteChanged`（`main.ts:256-261`）：以 `requestAnimationFrame` + 尾端觸發做 render 節流（同一幀內多次 `renderUI` 只執行最後一次；`renderUI` 內含 `try/catch`，錯誤走 `logger.error` 並不拋出）。
- `handleGraphChange`：改為比較 `getCurrentGraph().path` 與 `state.currentGraphPath`；刪除無作用的 `await MemoryManager.getAllSavedPages()`。若 `state.run` 進行中則先 `abort()` 再清 `chatStore`。
- `sendMsg` / `regenerateMsg` 在每次 `await` 之後用 `const chat = state.chatStore[targetUuid]; if (!chat) return;` 取代直接 `state.chatStore[targetUuid].msgs`（N6）。
- **草稿**：`state.tempInput` → `state.drafts: Record<string,string>`（key = pageUuid）；切頁時 textarea 顯示該頁草稿（`config.ts:15`、`ui.ts:121-123`）。

### 3c. 逾時與錯誤（3-H「fetch timeout」）

- 實作 `linkSignals(userSignal, timeoutMs)`（手動連結，不用 `AbortSignal.any`，Electron 版本不明）。
- 非串流：總逾時 120 s；串流（P6）：連線逾時 60 s（等到 headers）+ 讀取閒置逾時 60 s。逾時時回傳 `status:'error'` 並顯示 `t.timeout`（新增 i18n 鍵，兩語系）。
- 非 JSON 回應（HTML 錯誤頁）：`response.json()` 前先判斷 `response.ok` 與 `content-type`，避免 `Unexpected token <`；錯誤訊息帶 HTTP status。
- `agent.ts:240` 在非頁面路由（`currentPageUuid` 為 null）時 `sendMsg` 靜默：改為 toast `t.noPage`（新增鍵）。

### 3d. `panel` 清理（可選、同 PR）
- `deleteMsg` 的 toast/confirm 文案與行為一致：標籤改「刪除此訊息及之後所有訊息 / Delete from here」（`components.ts:111`、`i18n.ts:38,89` 已寫明後果，只需改按鈕字樣）。
- `exportChat`（`panel.ts:97-103`）：anchor 加入 DOM、`setTimeout(() => URL.revokeObjectURL(url), 1000)`；`confirm()` 在 iframe 可能被擋（`panel.ts:35,70`、`actions.ts:173`、`agent.ts:284`）→ 先在 V-spike 期間觀察；若被擋則改為二段式按鈕確認（本計畫不預先實作，列為 P3 完成後的觀察項）。

**測試（`tests/agent.test.ts`，`fetch` 以 `vi.fn` 取代）**：
- 對話長度 15 → `sendMsg`：全程 `state.isBusy===true`（以 `renderUI` spy 記錄每次呼叫時的 `isBusy`），Stop 鈕全程為 Stop（驗收 #4）。
- 壓縮階段 `stopTask()` → `summary` 未被寫入、主請求 `fetch` 未被呼叫、最終 `isBusy===false`（N2 回歸）。
- 連續 `updatePageContext` A→B→C，B 的 Promise 較晚 resolve → `currentPageUuid === C`。
- 切圖譜中 `ask` 進行中 → 不拋 TypeError。
- 逾時：假計時器推進 → `status:'error'` 且 `isBusy` 復位。

**P3 驗收映射**：#4。

---

## 6. Phase 4 — 效能

可獨立合併：是。**風險：中**。

1. **index**（N8）：新增 key `impeller_idx_<graphPrefixSuffix>`，值為 `JSON.stringify({ [uuid]: { name, count } })`（不 obfuscate；僅名稱，非敏感）。
   - `saveHistory` / `clearHistory` 同步更新 index；`getAllSavedPages()` 先讀記憶體快取 `cache.pages`（髒位），否則讀 index；index 缺失時才執行**一次**舊式全掃描（含逐筆 `try/catch`，單筆壞資料只跳過該筆），結果寫回 index。
   - `handleGraphChange` / `updatePageContext` 偵測到圖譜改變時 `invalidateMemoryIndex()`。
   - index key **不得**以 `impeller_chat_` 開頭（N8）。
2. `buildMemorySection` 改為吃 render 前已取得的陣列（`renderUI` 每次最多取一次並傳入；且當 `state.run` 進行中且上一次 render 後 index 未變，跳過 `memoryWrapper.innerHTML` 重寫 → 避免 chip 列 hover/捲動位置被重置）。
3. `buildApiPayload` 只輸出 `{ role, content }`（N7）；壓縮用的 `JSON.stringify(oldMessages)` 同樣只取 `{role,content}`。
4. `renderMarkdown` memoize（已在 2a 實作）→ 本 Phase 只做量測與微調。
5. 孤兒清理命令（D8）：`registerCommandPalette('purge-other-graph-chats')`，`confirm` 後只刪**非當前 prefix** 且符合 `impeller_chat_` 的 key；顯示刪除數量。
6. `renderUI` 加 `try/catch`（若 P3 尚未做）與 `stylesInjected` 與實際 `<style>` 探測同步（`ui.ts:10,18-21`；`provideStyle` 具 key，可直接每次呼叫而不依賴旗標 → 刪旗標）。
7. `state.lang: LangKey`，取代 `components.ts:30` 的 `langName.includes("Chinese")`（`main.ts:31` 設定處同步）。

**測試**：以 `localStorage` 預填 50 筆 × 30 訊息：
- `getAllSavedPages()` 第二次呼叫 `JSON.parse` 呼叫次數為 0（spy）。
- 預填一筆壞資料 → 其他 49 筆仍回傳。
- 另一圖譜 prefix 的 key 不會出現在結果中。
- V6 腳本重跑 → 紀錄降幅（驗收 #8，目標 ≥ 80%）。

**P4 驗收映射**：#8。

---

## 7. Phase 5 — 樣式統一、高亮、語義元素

可獨立合併：是（但須在 P6 之前）。**風險：中（視覺回歸，無自動化手段 → 以截圖驗收）**。

### 5a. 樣式（3-D）+ 語義元素（D5）
- `components.ts` 全部 inline style 遷入 `styles.ts`；`ui.ts:41-58` 容器改用 class：`.ai-container`、`.ai-shell`（`.is-collapsed` 由 `renderUI` 切換，**取代** `ui.ts:41` 的條件 inline 高度 → 同時消滅 P0-4）。
- 補齊 5 個無 CSS 的 class：`.chat-bubble-container`、`.ai-bubble-user`、`.ai-bubble-assistant`、`.ai-action-link`、`.ai-btn-action`。
- 氣泡區分：邊框 + 左側色條（user 用 `--ls-link-text-color` 色條右對齊、assistant 用 `--ls-border-color`），不依賴陰影。
- 高度（V8 決定）：預設 `height: calc(100dvh - var(--ai-sidebar-offset, 100px))` + `min-height: 280px`（將交接的 400px 降低，避免矮視窗裁切）；若 V8 證明祖先鏈高度確定，改 `height:100%` + flex。輸入區 `flex-shrink:0`，history `min-height:0; overflow-y:auto`。
- 主對話區套用與 `.ai-memory-scrollbar-container` 同款細捲軸。
- 刪 `styles.ts:40-58` 的 `.logseq-page-ref` 死樣式；移除與 inline 重複的 `!important`（`styles.ts:6-7,28,97,117`；若 Logseq 全域樣式需要覆蓋，以選擇器特異性解決，並在 V4/V8 實測 `!important` 去除後無回歸再刪）。
- `@media (prefers-reduced-motion: reduce)` 關閉 `transition/transform`（`styles.ts` 的 hover transform 與 `components.ts:39` 的 `transition`）。
- 刪 `--ls-active-primary-color` 無 fallback 問題：統一在 `.ai-container` 定義本插件變數（`--ai-accent: var(--ls-link-text-color, #4a90e2)` 等），其餘樣式只引用 `--ai-*`；對照 Logseq `common.css` 的實際變數名（實作時抓一次 DevTools computed 清單附在 findings）。

### 5b. 語義化（Tier 0 的標記部分）
- 受信模板的可點擊元素改為 `<button type="button" class="ai-action-link" data-ai-act=…>`（header 的 `↺`、`✕`、折疊、memory 折疊、chip、Copy/Retry/Delete）；`↺`、`✕` 加 `aria-label` + `title`（`components.ts:17-18`，兩語系 i18n 鍵：`resetSettingsTip, closePanelTip`）；折疊鈕加 `aria-expanded`。
- 對話區 `role="log"` + `aria-live="off"`；另加視覺隱藏 `#ai-sidebar-status`（`role="status" aria-live="polite"`）只在 4 個節點更新（D6）。
- Delete 的 `opacity:0.3`（`components.ts:110`）刪除，改為 `color: var(--ls-secondary-text-color)` 且對比度於 P7 稽核。
- 補 i18n（兩語系）：`copy, retry, delete, clear, export, send, stop, memoriesTitle`，取代 `components.ts:30,104,105,111,137,149,150,151` 的硬編碼。

### 5c. 語法高亮（3-F）
- 依賴：`highlight.js`；`src/utils/highlight.ts` 以 `highlight.js/lib/core` + 顯式註冊 `javascript, typescript, python, bash, json, css, xml(html), markdown, yaml, sql, rust, go, cpp, lua`（**含 lua**：驗收 #6 要用；共 14）。
- `renderer.code`：`const lang = hljs.getLanguage(l) ? l : null; html = lang ? hljs.highlight(text,{language:lang,ignoreIllegals:true}).value : escapeHTML(text)`。輸出的 `<span class="hljs-*">` 已被現有白名單（`span`、`class`）接受，無需放寬。
- 效能：單一 code block > 20 000 字元時略過高亮；串流中（P6）不高亮，完成後一次渲染。
- 主題：不引入 hljs CSS；於 `styles.ts` 手寫約 10 條 `.hljs-keyword/.hljs-string/.hljs-number/.hljs-comment/.hljs-title/.hljs-built_in/.hljs-attr/.hljs-literal/.hljs-meta` 規則，變數化為 `--ai-hl-*`；深色覆寫以 V4 實測的選擇器為準（預期 `.dark-theme #ai-sidebar-container` 與 `html[data-theme="dark"] #ai-sidebar-container` 雙選擇器）。兜底（亮度判斷）僅在 V4 顯示第三方主題缺少這兩者時才實作。
- 體積：`npm run build` 前後比對 `dist/assets/*.js` 大小，附於 PR。

**測試**：`renderMarkdown('```lua\nlocal v = t[[1]]\n```')` → 含 `hljs-` span，`textContent` 去 span 後等於原文；Copy 路徑：呼叫 events 的 copy handler，`copyToClipboard` 收到字串 `=== 原文`（驗收 #6）；未註冊語言（`brainfuck`）→ 純跳脫無拋出。截圖：深/淺各一張存 `.kilo/plans/` 或 PR 描述。

**P5 驗收映射**：#2、#6、#9（標記部分）。

---

## 8. Phase 6 — 串流與工具軌跡

**前置條件（硬性）**：P2、P3、P4、P5 皆已合併；V6 顯示 render 開銷已達標。**風險：最高**。

### 6a. 串流
- 新增 `src/llm/stream.ts`（可獨立單元測試，**不依賴** logseq 全域）：`async function* parseSSE(body: ReadableStream<Uint8Array>, signal)`，以及 `ToolCallAccumulator`。協定細節見**附錄 B**。
- `runCompletion` 在 `enableStreaming !== false` 時送 `stream:true`；以 `response.headers.get('content-type')` 判斷：`text/event-stream` → 走 SSE；`application/json` → 走既有非串流路徑（降級 1）。HTTP 4xx 且為本次首次串流請求 → 以 `stream:false` 重試一次，並記住本 session 對該 `basePath+model` 停用串流（降級 2）。
- 設定：`main.ts` 新增 `enableStreaming`（boolean、預設 true，兩語系 desc）；`resetSettings` 同步加入。
- UI 熱路徑：`renderStreamDelta(text)` 只更新「最後一個 assistant 氣泡」`.ai-bubble-content.innerHTML = renderMarkdown(text, {highlight:false})`，以 `requestAnimationFrame` 合併（≥ 80 ms 才重繪一次）；**不**呼叫 `buildMemorySection`、不重建 history。結束時做一次完整 `renderUI()`（含高亮）。
- 捲動：沿用 `ui.ts:87-95` 的「距底 ≤ 50px 才自動貼底」邏輯，抽成函式供串流路徑使用。
- 中止：partial 內容 + `\n\n🛑 **[已中止]**`（i18n）寫入 history；partial 的 markdown 若有未閉合 code fence，在結尾補 ```` ``` ```` 後再存（避免後續訊息被吞進 code block）。

### 6b. 工具軌跡（D7）
- `types.ts`：`ToolTraceEntry { id; name; argsSummary; status:'running'|'done'|'error'; ms? }`；`ChatMessage.trace?: ToolTraceEntry[]`。
- `runCompletion` 在每個工具開始/結束呼叫 `onToolEvent`；`state.liveTrace`（暫態）於 busy 氣泡內以 `<details>` 列出；完成時把 `trace` 附在最終 assistant 訊息上並隨 `saveHistory` 持久化（單筆最多 20 條、`argsSummary` ≤ 120 字）。
- 刪 `components.ts:88-90` 的 `role==='tool'` 分支；`panel.exportChat` 的 `tool` 角色對應同步刪除；`buildAbortSummary` 改為從 `trace` 產生（不再從 `currentMessages` 反推）。
- `buildApiPayload` 與壓縮輸入**忽略** `trace`（N7）。

**測試（`tests/stream.test.ts`，純函式 + `ReadableStream` 假資料）**：見附錄 B 的案例表。
**驗收映射**：#7。

---

## 9. Phase 7 — 無障礙收尾、文案、版本

可獨立合併：是。**風險：低**。

- Tier 1：全面 Tab 順序檢查；`:focus-visible` 外框（使用 `--ai-accent`）；Esc 中止（P2 已實作，補測試）；textarea 不再被搶焦（P1 已完成，補回歸）。
- 對比度稽核：Delete / 次要文字 / 時間戳 `opacity:0.45`（`styles.ts:118`）→ 以計算值 ≥ 4.5:1（深淺兩主題各量一次，數值記入 findings）。
- 文案同步（grep 驅動，**兩份 README 對稱**）：`Apply|套用|Format|格式化|hover|懸停|滑過|分頁|paginat|logseq-page-ref|自動雙向|Bi-Directional`；對應條目：`README.md:33,37,39,40,41,62,63,68`、`README.zh-TW.md:33,37,40,62,68`（行號為目前值，以 grep 為準）。新增串流、工具軌跡、語法高亮的實際說明。
- `CHANGELOG.md` 完成 Unreleased；`npm run bump` 前確認 `scripts/bump-version.mjs:66-67` 只改徽章（已確認）。
- 最終檢查：驗收 #1–#12 逐項勾選並附證據（測試名稱 / 截圖 / findings 行）。

---

## 10. 附錄 A — 相依與合併順序

```
P0 (CI + spikes) ─▶ P1 (1a→1b→1c→1d) ─▶ P2 (2a+2b 同 PR) ─▶ P3 ─▶ P4 ─▶ P5 ─▶ P6 ─▶ P7
```
硬性相依：P2→P3（render 呼叫點）；P4、P5→P6（串流熱路徑需要 memoize、index 與穩定 class/id）；2a↔2b（屬性名）；1a 越早越好（消除 4 個提示詞分支與 10 個 i18n 鍵的適配成本）。每個 Phase 自帶測試，且各 Phase 結束時 `npm ci && npm run typecheck && npm test && npm run build` 全綠才可合併。

---

## 11. 附錄 B — 串流協定細節（P6）

### B.1 請求
`POST {base}/chat/completions`，body 增加 `stream: true`；`tools`、`tool_choice`、`temperature`、`reasoning_effort` 維持原樣。不加 `stream_options.include_usage`（部分相容端點會 400）。Header 不變。

### B.2 SSE 解析（`parseSSE`）
- `reader = body.getReader()`；`decoder = new TextDecoder('utf-8')`，**每次 `decode(value, {stream:true})`**（多位元組字元可能跨 chunk 切開 — 中文）。
- 維護字串 buffer；以 `/\r?\n\r?\n/` 切事件（容忍 CRLF）；事件內逐行處理：以 `:` 開頭 = 註解/keep-alive（OpenRouter 會送 `: OPENROUTER PROCESSING`）→ 忽略；`data:` 後可有或無空白；多行 `data:` 以 `\n` 連接。
- `data: [DONE]` → 結束；串流在無 `[DONE]` 下自然結束 → 視為結束（部分 Ollama 版本）。
- `JSON.parse` 失敗的單一事件：略過並 `logger.warn`，**不中斷**整個串流（連續 > 3 次失敗才視為錯誤）。
- 事件含頂層 `error`（`data: {"error":{…}}`，OpenRouter 在串流中途出錯的形式）→ 轉為 `status:'error'`，保留已累積內容。
- `choices` 為空陣列（usage chunk）→ 忽略。
- `delta.reasoning` / `delta.reasoning_content` → 忽略（不入 history；若日後要顯示再開 issue）。
- 閒置逾時：每次收到 bytes 重置計時器（60 s）。
- 清理：`finally { reader.cancel().catch(()=>{}); reader.releaseLock?.() }`。

### B.3 `tool_calls` 聚合（`ToolCallAccumulator`）
- 以 `delta.tool_calls[i].index` 為 key 的陣列；`id`、`function.name` 取**第一個非空值**（有些 provider 每個分片都重複送 id/name，**不可累加**）；`function.arguments` **逐片字串拼接**。
- 缺少 `index` 的 provider（部分 Ollama / LM Studio 版本一次送完整 tool call）：若分片帶有 `id` 且與上一個不同 → 視為新項目，否則併入最後一項。
- `finish_reason === 'tool_calls'`（或串流結束且累積器非空）→ 結算：對每項 `JSON.parse(arguments || '{}')` 驗證；失敗者仍加入訊息，但標記 `error`，工具結果回傳既有的 `{error:"工具執行失敗或參數解析錯誤"}`（沿用 `agent.ts:62-69`）。
- 組出的 assistant 訊息：`{ role:'assistant', content: text || null, tool_calls:[{id,type:'function',function:{name,arguments}}] }`；`id` 缺失時補 `call_${iteration}_${index}`。
- `finish_reason === 'length'` → 回傳已累積文字 + 附加提示 `⚠️ 回覆因長度限制被截斷`。

### B.4 降級路徑
1. 回應 `content-type: application/json`（伺服器忽略 stream）→ 走既有非串流解析。
2. `stream:true` 回 4xx → 以 `stream:false` 重試一次；該 `basePath|model` 於本 session 記入 `noStreamSet`。
3. 使用者設定 `enableStreaming=false` → 永不送 `stream`。
4. `response.body` 為 null（極少）→ 當非串流處理。

### B.5 中止
- `controller.abort()` → `reader.read()` 拋 `AbortError`：已累積文字視為 partial，**丟棄**未完成的 tool call 累積器（不執行半成品工具）。
- 已執行完成的 tool trace 保留。
- 回傳 `{status:'aborted', content: partialText, trace}`；呼叫端依 6a 補 code fence 並寫入 history。

### B.6 工具迭代
一次 `runCompletion` 內仍是 `while (iterations < maxIterations)`；每次迭代一個串流請求。文字 delta 只在**當次迭代**串流到氣泡；若該迭代以 tool_calls 結束，氣泡內已顯示的前導文字保留在 `trace` 之前（不清空），最終答案接續其後。`maxIterations` 語意不變。

### B.7 測試案例表（`tests/stream.test.ts`）

| 案例 | 預期 |
|---|---|
| 單事件分兩個 chunk 切在 `\n\n` 中間 | 事件正確合併 |
| 中文字元的 UTF-8 三位元組切在 chunk 邊界 | 無亂碼 |
| CRLF 事件分隔 | 同 LF |
| 註解行、空事件、`[DONE]` | 忽略 / 結束 |
| `tool_calls` 引數分 5 片，`{"que` `ry":"a` `b"}`… | 結算後 `JSON.parse` 成功 |
| 每片都重複 `id` 與 `name` | 不累加成 `idid` |
| 兩個並行 tool_calls（index 0、1）交錯 | 各自完整 |
| 無 `index` 欄位的整包 tool call | 單項正確 |
| 事件為 `{"error":…}` | `status:'error'`，保留 partial |
| 中止於 tool_call 引數中途 | 不執行工具，partial 文字保留 |
| 回應為 JSON（非 SSE） | 走降級 1 |
| 400 + 重試 | 第二次請求不含 `stream` |

---

## 12. 附錄 C — 驗收標準映射與新增項

沿用交接 #1–#11，**修訂**：
- **#5** 改為：(a) `<button data-on-click="clearChat">`、(b) `<a data-on-click="openPage" data-page-name="X">`、(c) `<span data-ai-act="deleteMsg" data-index="0">`、(d) `<span data-ai-page="X">` 四種輸入，**sanitize 後皆無對應屬性**；並且以 `innerHTML` 強行注入 bubble 的 (c) 點擊後 `panel.deleteMsg` 呼叫次數為 0。
- **#6** 補：測試語言須含 `lua`（已列入註冊清單）。
- **#9** 以 jsdom 的 `tabindex`/`aria-label`/`role` 斷言 + 手動鍵盤走查；對比度用數值記錄。
- **#12（新增）**：主編輯區（contenteditable）有焦點時，`onRouteChanged` 觸發 `renderUI()` 不改變 `document.activeElement`。

| 驗收 | Phase | 主要證據 |
|---|---|---|
| #1 IME/游標 | P1b、P2b | `tests/events.test.ts` |
| #2 收合 | P5a | 切 3 次 `.is-collapsed`，`getComputedStyle` 高度檢查（jsdom 無版面 → 以 class 與手動截圖並用） |
| #3 慢速 DOM | P2b | 延遲 `provideUI` 測試 |
| #4 並發 | P3a | `tests/agent.test.ts` |
| #5 注入 | P2a/2b | `tests/markdown.test.ts`、`events.test.ts` |
| #6 高亮 | P5c | 單元 + 截圖 |
| #7 串流 | P6 | `tests/stream.test.ts` + 手動首字延遲 |
| #8 效能 | P4 | V6 腳本重跑 |
| #9 a11y | P5b、P7 | 斷言 + 走查 |
| #10 構建 | 全程 | `ci.yml` 綠燈 |
| #11 文案 | P1a、P7 | grep gate |
| #12 焦點 | P1b | 單元 |

---

## 13. 風險登記

| 風險 | 等級 | 緩解 |
|---|---|---|
| P2 全面改路由，若 V1 顯示 Logseq 也路由 → 雙重執行 | 高 | 路由命中即 `stopPropagation`；模板已全面換 `data-ai-act`，Logseq 的 `[data-on-click]` 選擇器不再匹配（僅 toolbar） |
| 串流 provider 差異（tool_calls 形狀、keep-alive、400） | 高 | 附錄 B 降級 + kill switch + 純函式單元測試；至少以 OpenRouter 與 Ollama 各手測一次再合併 |
| 樣式遷移造成視覺回歸（Logseq 版本/主題多） | 中 | V4/V8 先實測；深淺主題截圖列為 PR 必附 |
| localStorage index 與實際資料不同步 | 中 | index 只是快取：缺失/損毀時重建；單筆壞資料不拖累整體 |
| 刪除 formatPage 遺漏引用 | 中 | grep gate + `tsc`（`I18NKey` 為 `as const`） |
| `confirm()` 在 iframe 被封鎖 | 低（觀察項） | 若 P3 觀察到封鎖，另開工作項改二段式確認 |
| 舊使用者 `settings.tag` 殘留 | 低 | 無害；CHANGELOG 註明 |

## 14. 明確不做（維持交接範圍並補充）
Shadow DOM / iframe sandbox、前端框架、`strict:true`、RAG 內部、工具清單擴充、`((block-ref))`（D3）、自動刪除孤兒 key（D8）、Tier 2 SR 體驗、`systemPromptOverride` 預設重複問題（N11）。

## 15. 開放問題（不阻擋開工，P0 後確認）
1. `screenshot_format.jpg` 刪除後 `SCREENSHOTS.md` 版面如何重排？（預設：改為單張 `screenshot_copy.jpg`，若 `img/` 另有可用截圖則並列。）
2. `enableStreaming` 預設值：建議 `true`；若 P6 手測發現任一主流 provider 行為不穩，改預設 `false` 並於 README 註明。
