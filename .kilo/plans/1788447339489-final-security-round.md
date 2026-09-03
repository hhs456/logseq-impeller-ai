# 最終安全修補計畫（第四輪，亦為最後一輪）

## 範圍

3 項可 100% 解決的傳統漏洞。提示詞注入不在本輪範圍，接受殘留風險。

---

## Task 1 — 移除 DOMPurify `style` 白名單

**問題：** `src/utils/markdown.ts:77` 允許 `style` 屬性，可被用於 CSS 資料外洩與 UI 偽造。

**影響檔案：**
- `src/utils/markdown.ts`
- `src/ui/styles.ts`

**步驟：**

1. **`src/utils/markdown.ts`** — 移除 `ALLOWED_ATTR` 中的 `'style'`：

```typescript
// 修改前（第 76-79 行）
ALLOWED_ATTR: [
    'href', 'target', 'class', 'style', 'type', 'checked',
    'data-on-click', 'data-code', 'data-page-name'
]

// 修改後
ALLOWED_ATTR: [
    'href', 'target', 'class', 'type', 'checked',
    'data-on-click', 'data-code', 'data-page-name'
]
```

2. **`src/utils/markdown.ts`** — 移除 `renderer.code` 中的 inline style，改用純 class：

```typescript
// 修改前（第 50-59 行）
return `
<div style="position: relative; margin-bottom: 1em;">
    <button class="ai-copy-code-btn"
            style="position: absolute; top: 4px; right: 4px; padding: 2px 6px; font-size: 12px; opacity: 0.7; cursor: pointer; border-radius: 4px;"
            data-on-click="copyCode"
            data-code="${encodedCode}">📋 Copy</button>
    <pre><code class="language-${language}">${escapeHTML(text)}</code></pre>
</div>
`;

// 修改後
return `
<div class="ai-code-block">
    <button class="ai-copy-code-btn"
            data-on-click="copyCode"
            data-code="${encodedCode}">📋 Copy</button>
    <pre><code class="language-${language}">${escapeHTML(text)}</code></pre>
</div>
`;
```

**額外修正（計畫外發現）：** 第 36 行的 `[[頁面]]` wiki 連結也有 inline style，移除 `style` 白名單後會被 DOMPurify strip，需一併遷移：

```typescript
// 修改前（第 36 行）
return `<a class="ai-chat-wiki-link" data-on-click="openPage" data-page-name="${safe}" style="color: var(--ls-link-text-color); cursor: pointer; text-decoration: underline; font-weight: 500;">[[${safe}]]</a>`;

// 修改後
return `<a class="ai-chat-wiki-link" data-on-click="openPage" data-page-name="${safe}">[[${safe}]]</a>`;
```

3. **`src/ui/styles.ts`** — 在 `SIDEBAR_CSS` 尾端（第 148 行，`};` 前）加入程式碼區塊的 CSS：

```css
/* 🌟 程式碼區塊容器 */
#right-sidebar #ai-sidebar-container .ai-bubble-content .ai-code-block {
    position: relative;
    margin-bottom: 1em;
}
#right-sidebar #ai-sidebar-container .ai-bubble-content .ai-copy-code-btn {
    position: absolute;
    top: 4px;
    right: 4px;
    padding: 2px 6px;
    font-size: 12px;
    opacity: 0.7;
    cursor: pointer;
    border-radius: 4px;
}

/* 🌟 Wiki 連結樣式（原 inline style 遷移至此） */
#right-sidebar #ai-sidebar-container .ai-bubble-content .ai-chat-wiki-link {
    color: var(--ls-link-text-color);
    cursor: pointer;
    text-decoration: underline;
    font-weight: 500;
}
```

**驗證：** 渲染含程式碼區塊的 AI 回應，確認複製按鈕位置正確。

---

## Task 2 — API Key 改用 AES-GCM 加密

**問題：** `src/utils/obfuscate.ts` 使用 XOR(0x5A)+Base64，原始碼公開即可逆向。

**影響檔案：**
- 新增 `src/utils/crypto.ts`
- `src/agent.ts`
- `src/tools.ts`
- `src/main.ts`

**步驟：**

1. **新增 `src/utils/crypto.ts`：**

```typescript
// src/utils/crypto.ts
const SALT = 'impeller-ai-salt-v1';
const ITERATIONS = 100000;
// AES-GCM 加密前綴，用於判斷 key 是新格式還是舊 XOR 格式
export const AES_PREFIX = 'AES1:';

async function deriveKey(): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode('impeller-master-key'),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: enc.encode(SALT), iterations: ITERATIONS, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

export async function encryptApiKey(plaintext: string): Promise<string> {
    if (!plaintext) return '';
    const key = await deriveKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        enc.encode(plaintext)
    );
    const combined = new Uint8Array([...iv, ...new Uint8Array(ciphertext)]);
    return AES_PREFIX + btoa(String.fromCharCode(...combined));
}

export async function decryptApiKey(stored: string): Promise<string> {
    if (!stored) return '';
    // 新格式
    if (stored.startsWith(AES_PREFIX)) {
        try {
            const key = await deriveKey();
            const combined = Uint8Array.from(
                atob(stored.slice(AES_PREFIX.length)),
                c => c.charCodeAt(0)
            );
            const iv = combined.slice(0, 12);
            const ciphertext = combined.slice(12);
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                key,
                ciphertext
            );
            return new TextDecoder().decode(decrypted);
        } catch {
            return '';
        }
    }
    // 舊格式 fallback（XOR 解密）：遷移後可移除此段
    try {
        const OBFUSCATE_KEY = 0x5A;
        return atob(stored).split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ OBFUSCATE_KEY)).join('');
    } catch {
        return stored;
    }
}
```

2. **`src/main.ts`** — 在 `import` 區加入：

```typescript
import { encryptApiKey, decryptApiKey, AES_PREFIX } from './utils/crypto';
```

在 `main()` 函數中，緊接在 `const config = ...` 之後加入一次性遷移函數呼叫：

```typescript
// 一次性遷移：將舊 XOR 格式升級為 AES-GCM
async function migrateApiKeys() {
    const apiKey = logseq.settings?.apiKey as string;
    if (apiKey && !apiKey.startsWith(AES_PREFIX)) {
        const decrypted = await decryptApiKey(apiKey);
        if (decrypted) {
            logseq.updateSettings({ apiKey: await encryptApiKey(decrypted) });
        }
    }
    const webApiKey = logseq.settings?.webApiKey as string;
    if (webApiKey && !webApiKey.startsWith(AES_PREFIX)) {
        const decrypted = await decryptApiKey(webApiKey);
        if (decrypted) {
            logseq.updateSettings({ webApiKey: await encryptApiKey(decrypted) });
        }
    }
}
await migrateApiKeys();
```

**即時加密（額外修正）：** 在 `logseq.onSettingsChanged` callback 開頭加入即時加密邏輯，確保使用者換 key 時立刻加密，避免明文暴露：

```typescript
logseq.onSettingsChanged((newSettings) => {
    // 即時加密 API Key（直接加密明文，舊格式已在 migrateApiKeys 中遷移）
    const apiKey = newSettings.apiKey as string;
    if (apiKey && !apiKey.startsWith(AES_PREFIX)) {
        encryptApiKey(apiKey).then(encrypted => {
            logseq.updateSettings({ apiKey: encrypted });
        });
    }
    const webApiKey = newSettings.webApiKey as string;
    if (webApiKey && !webApiKey.startsWith(AES_PREFIX)) {
        encryptApiKey(webApiKey).then(encrypted => {
            logseq.updateSettings({ webApiKey: encrypted });
        });
    }
    // ... 原本的 basePath 驗證邏輯
});
```

**注意：** 這裡直接加密明文，**不需要先呼叫 `decryptApiKey`**。因為 `migrateApiKeys()` 已在啟動時處理舊格式，`onSettingsChanged` 遇到的非 `AES1:` 格式都是使用者新輸入的明文。若錯誤地先解密，會導致明文被 XOR fallback 產生亂碼，最終 API 認證失敗。

**效能說明：** `onSettingsChanged` 只在**使用者手動修改設定**時觸發，非同步加密不阻塞 UI，對日常使用無影響。

**顯示明碼功能：** 在設定 schema 中加入兩個 toggle，讓使用者可以暫時檢視明碼：

```typescript
// settings schema
{
    key: "showApiKey",
    type: "boolean",
    title: "👁️ 顯示 API Key（明碼）",
    description: "開啟後會在訊息中短暫顯示明碼 Key，隨後自動關閉此選項",
    default: false
},
{
    key: "showWebApiKey",
    type: "boolean",
    title: "👁️ 顯示 Web Search API Key（明碼）",
    description: "開啟後會在訊息中短暫顯示明碼 Key，隨後自動關閉此選項",
    default: false
}

// onSettingsChanged 中
if (newSettings.showApiKey) {
    const key = newSettings.apiKey as string;
    if (key) {
        decryptApiKey(key).then(decrypted => {
            if (decrypted) {
                logseq.UI.showMsg(`🔑 API Key: ${decrypted}`, 'info', { timeout: 15000 });
            }
        });
    }
    logseq.updateSettings({ showApiKey: false });
}
// webApiKey 同理
```

**運作流程：** 使用者開啟 toggle → 解密並顯示 15 秒 → toggle 自動關閉。

3. **`src/agent.ts`** — 替換 import 與解密呼叫：

```typescript
// 移除：import { deobfuscate } from './utils/obfuscate';
// 加入：
import { decryptApiKey } from './utils/crypto';

// 第 125 行，修改前：
const apiKey = deobfuscate(logseq.settings?.apiKey as string);
// 修改後：
const apiKey = await decryptApiKey(logseq.settings?.apiKey as string);
```

4. **`src/tools.ts`** — 替換 import 與解密呼叫：

```typescript
// 移除：import { deobfuscate } from './utils/obfuscate';
// 加入：
import { decryptApiKey } from './utils/crypto';

// 第 194 行，修改前：
const apiKey = deobfuscate(logseq.settings?.webApiKey as string);
// 修改後：
const apiKey = await decryptApiKey(logseq.settings?.webApiKey as string);
```

**注意：** `obfuscate.ts` 保留不刪，因為遷移函數的 fallback 路徑仍需要 `deobfuscate` 邏輯（已直接寫入 `crypto.ts`，無需再 import）。

**驗證：**
1. 設定頁面填入 API Key，儲存後確認 `logseq.settings.apiKey` 開頭為 `AES1:`
2. 發送一則訊息，確認 API 請求成功（代表解密正確）
3. 重新載入插件，確認 API Key 持久化正常

---

## Task 3 — 工具參數長度與格式驗證

**問題：** `src/tools.ts` 的 `executeToolCall()` 沒有驗證 LLM 傳入的參數，可被惡意超長字串或格式錯誤的 UUID 觸發異常。

**影響檔案：**
- `src/tools.ts`

**步驟：**

在 `src/tools.ts` 開頭加入常數與驗證函數，並在 `executeToolCall` 的 `try` 區塊最前面呼叫：

```typescript
// 在 import 區塊後、第一個 export function 前加入
const MAX_PARAM_LENGTH = 500;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateToolArgs(toolName: string, args: any): string | null {
    for (const [key, value] of Object.entries(args)) {
        if (typeof value === 'string' && value.length > MAX_PARAM_LENGTH) {
            return `Parameter '${key}' exceeds maximum allowed length of ${MAX_PARAM_LENGTH}`;
        }
    }
    if (toolName === 'read_target_block') {
        if (!args.uuid || !UUID_REGEX.test(args.uuid)) {
            return 'Invalid UUID format for read_target_block';
        }
    }
    return null; // 通過驗證
}
```

在 `executeToolCall` 的 `try {` 之後、`console.log` 之前加入：

```typescript
const validationError = validateToolArgs(toolName, args);
if (validationError) {
    console.warn(`[Tool 驗證] 參數拒絕: ${validationError}`);
    return JSON.stringify({ error: validationError });
}
```

**驗證：** 在 DevTools 中手動呼叫 `executeToolCall('read_target_block', { uuid: 'INVALID' })`，應得到 `{ error: 'Invalid UUID format...' }`。

---

## 執行順序

```
Task 1（style 白名單）→ Task 3（工具驗證）→ Task 2（AES-GCM）
```

Task 2 最後執行，因為它涉及新增檔案與非同步遷移，風險相對較高，應在其他修改確認正確後再做。

## 額外修正（實作時發現的問題）

### 1. `obfuscate.ts` Unicode 編碼問題
**問題：** `btoa()` 只能編碼 Latin1 範圍字元，中文對話導致 `InvalidCharacterError`。

**修正：**
```typescript
// 編碼：先轉 UTF-8 百分比編碼，再 base64
btoa(unescape(encodeURIComponent(xored)))

// 解碼：反向操作
decodeURIComponent(escape(atob(encoded)))
```

### 2. `rag.ts` null 檢查
**問題：** `logseq.DB.datascriptQuery()` 可能回傳 `null`，導致 `.flat()` 失敗。

**修正：** 在 `rag.ts:74` 加入 null 檢查：
```typescript
if (!results) return [];
```

---

## 驗證清單

- [ ] 含程式碼區塊的 AI 回應正常顯示，複製按鈕位置正確
- [ ] 含 `[[頁面]]` wiki 連結的回應正常顯示，樣式正確（連結色、底線、粗體）
- [ ] DOMPurify 白名單不含 `style`（可用 DevTools 確認）
- [ ] `logseq.settings.apiKey` 儲存後開頭為 `AES1:`
- [ ] 重新載入後 API 請求仍然成功（解密正確）
- [ ] 超過 500 字元的工具參數被拒絕並回傳錯誤訊息
- [ ] 格式錯誤的 UUID 被拒絕並回傳錯誤訊息
- [ ] 中文對話能正常儲存到記憶庫
- [ ] 執行 `npm run build` 無 TypeScript 編譯錯誤

## 停止點

完成這 3 項後，安全修補工作正式結束。提示詞注入的殘留風險屬 LLM 架構性限制，接受並記錄於此即可。
