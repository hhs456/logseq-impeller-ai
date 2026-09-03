# 資安漏洞修復計畫（含第二輪新發現）

**目標**：修復所有已識別漏洞，不影響現有功能。  
**範圍**：P0–P3 優先級的 10 項漏洞（第一輪），加上第二輪重新審查後新發現的 2 項可修復漏洞。

---

## 前置確認

- 修復後 Wiki-link 點擊跳轉功能仍正常運作
- Datalog 搜尋工具仍可正確處理中文、英文、符號等關鍵字
- `basePath` 支援 `http://` 協定（Ollama localhost）不被破壞
- API Key / Web Search Key 的 reset / 讀取流程不受影響
- Code block 的語法高亮 class 名稱顯示不受影響（`language-typescript` 等仍正常套用）

---

## 任務清單（第一輪 — 已完成）

### P0 — 必須優先修復

#### 任務 1：修復 XSS（Wiki-link 屬性逃逸）✅
**檔案**：`src/utils/markdown.ts`，第 32–38 行

**問題**：`[[頁面名稱]]` 中若包含 `"` 字元，會逃逸 `data-page-name` 屬性邊界，注入任意 HTML 屬性（含白名單中的 `data-on-click`、`data-code`）。

**修復方式**：將 `replace` 的第二個參數改為**函式回呼**，對捕獲組 `$1`（頁面名稱）呼叫已存在的 `escapeHTML()` 函式，再組合 HTML：

```typescript
const processedText = text.replace(
    /\[\[(.*?)\]\]/g,
    (_, pageName) => {
        const safe = escapeHTML(pageName);
        return `<a class="ai-chat-wiki-link" data-on-click="openPage" data-page-name="${safe}" style="color: var(--ls-link-text-color); cursor: pointer; text-decoration: underline; font-weight: 500;">[[${safe}]]</a>`;
    }
);
```

**功能影響**：無。

---

#### 任務 2：強化 Datalog 注入防禦 ✅
**檔案**：`src/utils/query.ts`

**修復方式**：在 `escapeDsString` 補充控制字元的跳脫：

```typescript
export function escapeDsString(str: string): string {
    return str
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t')
        .replace(/\f/g, '\\f');
}
```

---

### P1 — 次優先修復

#### 任務 3：驗證 basePath URL 格式（防 SSRF）✅
**檔案**：`src/agent.ts`，`ask()` 函式開頭

**修復方式**：加入 URL 格式驗證，僅允許 `http:`/`https:` 協定；使用 `parsedBase.origin + parsedBase.pathname` 重組 URL，避免尾斜線造成雙斜線。

---

#### 任務 4：針對 Prompt 注入加入輸入長度限制 ✅
**檔案**：`src/agent.ts`，`sendMsg()` 函式

**修復方式**：加入 8000 字元上限，超過時截斷並顯示警告。

---

### P2 — 建議修復

#### 任務 5：移除生產環境敏感 console.log ✅
**檔案**：`src/agent.ts`，第 136、153 行（原行號）

**修復方式**：改為僅印出模型名稱與工具數量的摘要 log，不含請求體或回應體。

---

#### 任務 6：`onSettingsChanged` 加入 basePath 重新驗證 ✅
**檔案**：`src/main.ts`，第 136–140 行

**修復方式**：加入 basePath URL 格式驗證警告。

---

### P3 — 低優先修復

#### 任務 7：`buildMemorySection` 頁面名稱二次跳脫確認 ✅
**檔案**：`src/ui/components.ts`，第 33–41 行

**動作**：確認安全，已加入說明註解。

---

#### 任務 8：Clipboard fallback 降級處理 ✅
**檔案**：`src/utils/clipboard.ts`，第 18 行

**修復方式**：加入 `console.warn` 棄用警告。

---

---

## 任務清單（第二輪 — 新發現，待實作）

### P0 — 任務 9：修復 Code Block `lang` 屬性 CSS 注入（新發現）

**檔案**：`src/utils/markdown.ts`，第 44–60 行

**問題**：

`renderer.code` 中 `language` 變數直接插入 HTML 屬性，沒有經過跳脫：

```typescript
// 現況（危險）
renderer.code = function({ text, lang }) {
    const language = lang || '';  // ❌ 未跳脫
    ...
    return `<pre><code class="language-${language}">${escapeHTML(text)}</code></pre>`;
};
```

**攻擊路徑**：

當 LLM 回覆中包含惡意程式碼區塊（需透過 Prompt 注入觸發）：

````
```x" style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;background:url(https://attacker.com/track)
惡意內容
```
````

`language` 變數的值為 `x" style="position:fixed;...`，插入後產生：

```html
<code class="language-x" style="position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;background:url(https://attacker.com/track)">
```

由於 DOMPurify 的 `ALLOWED_ATTR` 白名單包含 `style`，且 DOMPurify **不過濾 `https://` URL**（只過濾 `javascript:`），這個注入的 `style` 屬性會被完整保留。

**攻擊效果**：
1. **追蹤像素攻擊**：瀏覽器向 `https://attacker.com/track` 發送請求，洩漏使用者資訊（IP、User-Agent）
2. **UI 紅遮蔽攻擊**：全螢幕覆蓋偽造介面，誘導使用者點擊惡意連結
3. **CSS 資料外洩**：使用 CSS `:nth-child` 選擇器等技術竊取部分 DOM 內容

**修復方式**：

對 `language` 變數套用同一檔案中已存在的 `escapeHTML()` 函式。對 `button` 元素的 `data-code` 旁邊的 `language` 值（用於 `class` 屬性）同樣跳脫：

```typescript
// 修復後
renderer.code = function({ text, lang }) {
    const language = escapeHTML(lang || '');  // ✅ 加入跳脫
    const encodedCode = encodeURIComponent(text);
    
    return `
    <div style="position: relative; margin-bottom: 1em;">
        <button class="ai-copy-code-btn" 
                style="position: absolute; top: 4px; right: 4px; padding: 2px 6px; font-size: 12px; opacity: 0.7; cursor: pointer; border-radius: 4px;" 
                data-on-click="copyCode" 
                data-code="${encodedCode}">📋 Copy</button>
        <pre><code class="language-${language}">${escapeHTML(text)}</code></pre>
    </div>
    `;
};
```

**功能影響**：

無。`escapeHTML()` 只會將 `<`, `>`, `"`, `'`, `&` 轉為 HTML 實體。合法的語言名稱（`typescript`、`python`、`bash`、`javascript` 等）均為純 ASCII 字母，`escapeHTML()` 不會改變它們。語法高亮 class `language-typescript` 等仍正常套用。

---

### P2 — 任務 10：移除 Tool 執行時的參數洩漏 console.log（新發現）

**檔案**：`src/tools.ts`，第 122 行

**問題**：

```typescript
// 現況（洩漏）
console.log(`[Tool 執行] 啟動工具: ${toolName}`, args);  // ❌ 印出完整 args
```

`args` 包含 LLM 傳入的工具參數，例如：
- `semantic_search` 的 `query`（使用者的思考內容）
- `read_target_block` 的 `uuid`（筆記的唯一識別符）
- `global_keyword_search` 的 `keyword`（可能包含敏感詞彙）

這些資訊會在 DevTools Console 中完整顯示，任何能打開 DevTools 的人（包括本機上的其他使用者）都可以看到。

**修復方式**：

移除 `args` 參數，僅保留工具名稱：

```typescript
// 修復後
console.log(`[Tool 執行] 啟動工具: ${toolName}`);  // ✅ 不含參數
```

**功能影響**：無。工具執行邏輯完全不受影響。

---

## 修復順序（第二輪）

```
任務 9 (lang 屬性 CSS 注入) — P0，優先
  → 任務 10 (tools.ts console.log) — P2
```

---

## 驗證測試清單（含第二輪）

實作後需手動驗證：

### 第一輪（已完成，回歸確認）
1. **Wiki-link 功能**：AI 回覆中含 `[[測試頁面]]`，點擊後可正常跳轉；含特殊字元的頁面名如 `[[test"page]]` 顯示正常。
2. **Datalog 搜尋**：使用含換行、引號的搜尋關鍵字，不拋出例外。
3. **basePath 驗證**：`http://localhost:11434`（通過）；`javascript:alert(1)` 或 `file:///etc/passwd`（顯示錯誤）。
4. **API 請求**：設定合法 basePath 後，AI 對話功能正常。
5. **超長輸入**：輸入超過 8000 字元，顯示截斷警告，不崩潰。

### 第二輪（新增）
6. **Code block 語法高亮**：AI 回覆中包含 ` ```typescript ` 程式碼區塊，渲染後 class 為 `language-typescript`，顯示正常。
7. **Code block lang 注入防禦**：AI 回覆中包含 ` ```x" style="color:red ` 程式碼區塊，渲染後確認 `style` 屬性**不存在**於 `<code>` 元素上（`style` 被 escapeHTML 跳脫後，`"` 無法逃逸屬性邊界）。
8. **Tool 執行 log**：觸發 AI 使用工具後，打開 DevTools Console，確認 log 只有 `[Tool 執行] 啟動工具: semantic_search`，沒有印出 `args` 物件。

---

## 不在範圍內的項目（有意排除）

- **API Key 加密存儲**：Logseq 插件 API 沒有提供加密存儲機制，且加密 key 也必須存在前端，無法真正防止本地存取。
- **localStorage 對話加密**：同上，在 Logseq 插件環境中加密無法帶來實質安全效益。
- **Prompt 注入完整防禦（頁面內容/工具結果）**：完整防禦需要大幅改變架構（輸入沙盒、工具權限隔離），超出「不影響原功能」的約束，僅以輸入長度限制作為緩解措施。
- **`systemPromptOverride` 的注入防禦**：此欄位的設計意圖就是讓使用者完全控制 system prompt，屬於刻意開放的設計，不應限制。
- **http:// basePath 強制升級 https**：`http://` 協定對 Ollama localhost 是合理需求，且 HTTPS 對 localhost 無安全效益，僅以警告提示處理。
