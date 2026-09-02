# Settings Improvement Plan

## Context

- Plugin: `logseq-impeller-ai` v0.9.4
- Target version: `0.10.0`
- Settings schema: `src/main.ts:32–125`
- API call body: `src/agent.ts:124`
- i18n strings: `src/i18n.ts`
- Reset mirror: `src/actions.ts:resetSettings()`
- Version files: `package.json` (version), `README.md` (badge), `README.zh-TW.md` (badge), `CHANGELOG.md`

---

## Scope

三項獨立改動，合併為一個 minor release (`0.9.4` → `0.10.0`)：

1. **System Prompt 欄位顯示預設內容**
2. **新增 Reasoning Effort 設定**
3. **版號與文件更新自動化腳本**

---

## Task 1 — System Prompt 欄位顯示預設內容

### 問題
`systemPromptOverride` 的 description 只說「留空使用內建提示」，使用者完全不知道內建提示的內容。

### 決策
在 `description` 欄位中直接嵌入內建 system prompt 的**摘要/全文**。

由於 Logseq 設定面板的 description 是純文字（不渲染 Markdown），且 `buildSystemPrompt()` 是 runtime 函式（需要頁面資料），這裡嵌入的是**靜態摘要預覽**，說明預設提示的結構與各 section 意涵即可。

### 改動清單

#### `src/i18n.ts`
- 將 `settingSystemPromptDesc` 從「留空則使用內建提示（推薦）。此處的指令會優先覆蓋預設行為。」  
  改為包含預設 prompt 結構摘要的完整說明文字，例如：
  ```
  自訂 AI 系統提示詞。留空則使用內建提示（推薦）。
  
  【內建提示包含以下規則】
  §1 TIME CONTEXT — 注入當前時間
  §2 TOOL USAGE — 禁止猜測，必須用工具查詢即時資訊
  §3 CITATION RULE — 使用 web_search 後必須引用來源
  §4 LOGSEQ FORMATTING — 套用時使用階層式 Markdown 清單
  §5 BI-DIRECTIONAL LINKING — 自動識別重要實體並加上 [[雙向連結]]
  
  在此輸入自訂指令會以 §0 插入最高優先序，覆蓋以上預設行為。
  ```
  英文版同步更新。

#### `src/main.ts`
- `systemPromptOverride` 的 `description` 欄位已引用 `state.t.settingSystemPromptDesc`，無需修改。

---

## Task 2 — 新增 Reasoning Effort 設定

### 背景
OpenAI o1/o3 系列（及 OpenRouter 對應模型）支援 `reasoning_effort` 參數（值：`"low"` / `"medium"` / `"high"`），可控制推理深度與 token 消耗。非推理模型會忽略此參數，因此對一般模型沒有副作用。

### 決策
- 新增 `reasoningEffort` 設定欄位，型別 `string`，預設 `""` (空字串 = 不傳)
- 下拉選項提示：`""` | `"low"` | `"medium"` | `"high"`（Logseq 設定目前只支援 `string`，使用 description 說明有效值）
- 在 API request body 中，僅當值非空時才附加 `reasoning_effort` 欄位

### 改動清單

#### `src/i18n.ts`
新增 key：
- `settingReasoningEffortDesc` (zh-TW): `"控制推理模型（如 o3, o4-mini）的思考深度。留空表示不指定（適用大多數模型）。有效值：low / medium / high。"`
- `settingReasoningEffortDesc` (en): `"Controls reasoning depth for thinking models (e.g. o3, o4-mini). Leave blank to omit (works for all models). Valid values: low / medium / high."`

#### `src/main.ts`
在 `systemPromptOverride` 欄位之後、`headingAdvanced` 之前插入新設定項：
```ts
{
    key: "reasoningEffort",
    type: "string",
    title: "Reasoning Effort",
    description: state.t.settingReasoningEffortDesc,
    default: ""
},
```

#### `src/agent.ts` (`ask()` 函式)
在 `ask()` 函式中，讀取 `reasoningEffort` 並條件性附加到 `requestBody`：

```ts
// 現有
const maxIterations: number = ...
const temperature: number = ...

// 新增
const reasoningEffort: string =
    ((logseq.settings?.reasoningEffort as string) ?? "").trim().toLowerCase();

// 現有
const requestBody: any = { model, messages: currentMessages, temperature };

// 修改後
const requestBody: any = { model, messages: currentMessages, temperature };
if (reasoningEffort) {
    requestBody.reasoning_effort = reasoningEffort;
}
```

#### `src/actions.ts` (`resetSettings()`)
在 `logseq.updateSettings()` 呼叫中新增：
```ts
reasoningEffort: "",
```

---

## Task 3 — 版號與文件更新自動化

### 問題
每次發版需手動同步更新：
1. `package.json` → `version`
2. `README.md` → version badge URL (hardcoded string)
3. `README.zh-TW.md` → version badge URL (hardcoded string)
4. `CHANGELOG.md` → 新增版本標題

目前沒有任何腳本或工具鏈。

### 決策
新增一個 Node.js 腳本 `scripts/bump-version.mjs`，執行方式：
```
node scripts/bump-version.mjs 0.10.0
```

腳本職責：
1. 讀取並更新 `package.json` 的 `version` 欄位
2. 用 regex 替換 `README.md` 與 `README.zh-TW.md` 中的 badge URL（pattern: `version-v\d+\.\d+\.\d+-blue`）
3. 在 `CHANGELOG.md` 的第一個 `# [` 標題前插入新版本佔位區塊：
   ```markdown
   # [X.Y.Z] - YYYY-MM-DD
   
   ### Added
   - 
   
   ### Changed
   - 
   
   ### Fixed
   - 
   
   ```
4. 列印 summary 告知哪些檔案已更新

同時在 `package.json` 的 `scripts` 中新增：
```json
"bump": "node scripts/bump-version.mjs"
```

使用方式：`npm run bump 0.10.0`

> **不引入** `standard-version`、`release-it` 等外部工具，保持零依賴、透明可讀。

### 改動清單

#### 新建 `scripts/bump-version.mjs`
- 使用 Node.js 內建 `fs/promises`，無額外依賴
- 接受 CLI 參數 `process.argv[2]` 作為新版本號，若未提供則報錯退出
- 驗證版本格式符合 semver `\d+\.\d+\.\d+`

#### `package.json`
- 新增 `"bump": "node scripts/bump-version.mjs"` 到 `scripts`

---

## Version Bump for This Release

執行以上所有改動後，執行：
```
npm run bump 0.10.0
```
然後手動補填 `CHANGELOG.md` 的 Added/Changed/Fixed 條目，描述本次三項改動。

---

## Validation

1. `npm run build` 通過（TypeScript 編譯無錯誤）
2. 在 Logseq 載入插件，確認設定面板出現 "Reasoning Effort" 欄位
3. 設定 `reasoningEffort = "high"`，在 devtools Network 面板確認 API request body 含 `"reasoning_effort": "high"`
4. 設定 `reasoningEffort = ""`（或空白），確認 request body **不含** `reasoning_effort` 欄位
5. 確認 `systemPromptOverride` description 顯示內建 prompt 結構摘要
6. 執行 `npm run bump 0.10.1`（測試用），確認三個檔案的版號同步更新，CHANGELOG 頂端插入新條目
7. 執行 Reset Settings，確認 `reasoningEffort` 被重設為 `""`

---

## Open Questions

無。所有決策已確認。
