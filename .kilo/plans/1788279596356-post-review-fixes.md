# Post-Review Fixes Plan

## 背景

基於 commit `a0e94e7` 的 Code Review，以下 6 個問題需要修正。依嚴重度排序執行。

---

## 問題清單與修正方式

### 🟡 Issue 1：clipboard.ts — 遺失第一層錯誤記錄

**位置：** `src/utils/clipboard.ts:7`

**問題：** `catch { ... }` 沒有綁定錯誤變數，導致 `navigator.clipboard.writeText` 的失敗原因完全遺失，fallback 內的錯誤記錄也只記了 `fallbackErr`。

**修正：**
```ts
// 舊
} catch {
// 改為
} catch (err) {
// 並在 fallback 的 catch 中
console.error('Clipboard copy failed:', err, fallbackErr);
```

---

### 🟡 Issue 2：rag.ts — for 迴圈中每筆 async hash 造成效能損耗

**位置：** `src/rag.ts:107-119` 和 `src/rag.ts:145`

**問題：** `computeContentHash` 在兩個 for 迴圈中被順序呼叫，大量筆記時 hash 計算逐筆等待。另外第 145 行對同一個 `block.content` 重複呼叫一次 hash，造成多餘計算。

**修正：**
1. 在進入迴圈前，用 `Promise.all` 批次計算所有 hash
2. 消除第 145 行的重複 hash — 直接從第一個迴圈的結果中複用

```ts
// 在 syncVectorDB() 中，取代兩個 for 迴圈的 hash 計算

// Step 1: 批次計算所有 hash
const hashes = await Promise.all(blocks.map(b => computeContentHash(b.content)));

// Step 2: 帶 hash 的 for 迴圈
for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const contentHash = hashes[i];          // 直接取用，不再 await
    const cacheKey = `${graphName}_${block.id}_${contentHash}`;
    // ...
    // 第 145 行也改為使用 hashes[i]
}
```

---

### 🟡 Issue 3：i18n.ts — 型別過寬，失去型別安全

**位置：** `src/i18n.ts:1`

**問題：** `Record<string, Record<string, string>>` 允許任意 key，TypeScript 無法在編譯期發現 key 拼寫錯誤。

**修正：** 使用 `as const` + 輔助型別，讓 TypeScript 推論完整 key 集合：

```ts
// 用 as const，讓 TypeScript 記住所有 key
const _I18N_BASE = {
    "zh-TW": { /* ... */ },
    "en":    { /* ... */ }
} as const;

export type LangKey = keyof typeof _I18N_BASE;
export type I18NKey = keyof typeof _I18N_BASE['zh-TW'];
export const I18N: Record<LangKey, Record<I18NKey, string>> = _I18N_BASE;
```

這樣一來，`state.t.nonExistentKey` 在 TypeScript 中會報錯（前提是 `state.t` 的型別也跟著更新，見下方 Issue 6）。

---

### 🟢 Issue 4：logger.ts — DEBUG 硬編碼，無法動態切換

**位置：** `src/utils/logger.ts:1`

**問題：** `const DEBUG = false` 硬編碼，開發者在本地 debug 時需要手動改檔案，容易不小心 commit 進去。

**修正：** 改用 Vite 的 `import.meta.env.DEV`：

```ts
const DEBUG = import.meta.env?.DEV ?? false;
```

Vite 在 `npm run dev` 時 `import.meta.env.DEV` 為 `true`，`npm run build` 時為 `false`，tree-shaking 會自動移除 debug 分支。

---

### 🟢 Issue 5：rag.ts + tools.ts — Datascript escape 邏輯重複

**位置：** `src/rag.ts:197`, `src/tools.ts:228`

**問題：** 相同的 escape 邏輯 (`.replace(/\\/g, '\\\\').replace(/"/g, '\\"')`) 分散在兩個地方，未來若 Datascript 還需要 escape 其他字元，需要在兩處各改一次。

**修正：** 在 `src/utils/` 新增共用函式：

```ts
// src/utils/query.ts
export function escapeDsString(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
```

然後 `rag.ts` 和 `tools.ts` 各自 import 這個函式取代內聯邏輯。

---

### 🟢 Issue 6：types.ts — `state.t` 型別為 `any`

**位置：** `src/types.ts:41`

**問題：** `t: any` 讓整個 i18n 物件失去型別保護，即使 Issue 3 修了 `i18n.ts`，`state.t.someKey` 的型別仍然是 `any`。

**修正：** 配合 Issue 3 完成後，將型別改為：

```ts
// types.ts
import type { I18NKey } from './i18n';
// ...
t: Record<I18NKey, string> | null;
```

---

## 執行順序

```
Issue 1 (clipboard.ts)     — 獨立，先做
Issue 4 (logger.ts)        — 獨立，先做
Issue 5 (新增 query.ts)    — 獨立，先做
Issue 3 (i18n.ts as const) — 先做，Issue 6 依賴它
Issue 6 (types.ts t:)      — 依賴 Issue 3
Issue 2 (rag.ts hash 批次) — 最後，需要完整測試
```

---

## 驗證步驟

1. `tsc --noEmit` — 確認零 TypeScript 錯誤
2. `npm run build` — 確認 Vite bundle 成功
3. 手動測試 clipboard（在 Logseq 插件環境中點複製按鈕）
4. 手動觸發 RAG sync（切換圖譜或重啟），確認增量更新訊息正常顯示

---

## 範圍外

- `execCommand` 棄用問題（Issue 6 from review）：此 API 在 Electron 環境下仍可用，短期內不會消失，延後處理。
- 其他非本次 review 的重構。
