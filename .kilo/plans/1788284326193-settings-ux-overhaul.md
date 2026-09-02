# Settings UX Overhaul Plan

## Goal
Restructure the plugin settings for better progressive disclosure (enum dropdowns for model/endpoint preset, visual section grouping via `heading` type), add new customization fields, ensure full zh-TW / en i18n coverage on all setting descriptions, and provide a "Reset to Defaults" mechanism accessible from the command palette and the chat sidebar.

## Key Technical Constraints (verified)

- Logseq `useSettingsSchema` supports: `type: 'heading'` (section divider, no value), `type: 'enum'` + `enumChoices` + `enumPicker: 'select'`, `type: 'boolean'`, `type: 'string'`, `type: 'number'`
- `type: 'heading'` fields act as visual section headers — this is the only native grouping mechanism; **conditional field rendering is not supported**
- `logseq.updateSettings(attrs)` can be called programmatically at any time to reset values
- `description` field supports Markdown — model suggestions can live there
- The chat sidebar (custom HTML in `src/ui.ts`) is freely extensible

## Decisions Made

| Decision | Choice |
|---|---|
| Conditional fields (show dropdown only after API key) | Not possible natively; use `heading` grouping + Markdown hints in descriptions instead |
| Model selection | `enum` type with preset popular models as `enumChoices`; user can also type a custom value (note: Logseq `enum` with `select` picker does NOT allow free-text fallback — see risk) |
| "Reset to defaults" location | Both: (a) Command palette entry, (b) small button in the chat sidebar header |
| New fields to add | `temperature` (number), `systemPromptOverride` (string/textarea), `enableSemanticSearch` (boolean), `enableWebSearch` (boolean as on/off gate instead of key-present logic) |
| i18n | All new setting `title` and `description` strings added to both `zh-TW` and `en` in `i18n.ts` |

## Risk: `enum` type does not allow free-text input
Logseq's `enum` + `select` picker only allows choosing from `enumChoices`. If a user wants a model not in the list, they cannot type it. **Mitigation:** Keep `model` as `type: 'string'` with a rich `description` listing popular model IDs. Only convert `basePath` to `enum` (for endpoint presets) since those are well-defined URLs.

---

## Files to Change

| File | Changes |
|---|---|
| `src/i18n.ts` | Add new i18n keys for all new settings and the reset command |
| `src/main.ts` | Replace `useSettingsSchema` block; add "Reset to Defaults" command palette entry; update `onSettingsChanged` handler |
| `src/ui/components.ts` | Add reset-defaults button to `buildHeader()` |
| `src/agent.ts` | Read `temperature` from settings when building fetch body; honor `enableSemanticSearch` / `enableWebSearch` booleans |
| `src/tools.ts` | Guard `semantic_search`, `graph_tag_search`, etc. behind `enableSemanticSearch` setting; guard `web_search` behind `enableWebSearch` setting (replaces key-present check) |
| `src/prompts.ts` | Check for `systemPromptOverride` setting; if non-empty, use it to replace the hardcoded base sections |
| `src/actions.ts` | Add `resetSettings` action to the actions object (for sidebar button click) |

---

## Ordered Implementation Tasks

### 1. `src/i18n.ts` — Add new keys

Add the following keys to both `zh-TW` and `en` objects:

```
settingHeadingConnection      // "🔑 連線設定" / "🔑 Connection"
settingHeadingBehavior        // "⚙️ 行為設定" / "⚙️ Behavior"
settingHeadingAdvanced        // "🔬 進階功能" / "🔬 Advanced Features"
settingTemperatureDesc        // description for temperature field
settingSystemPromptDesc       // description for systemPromptOverride field
settingEnableSemanticDesc     // description for enableSemanticSearch boolean
settingEnableWebSearchDesc    // description for enableWebSearch boolean (replaces old webApiKey description note)
settingResetDesc              // description: "重設所有設定回出廠預設值" / "Reset all settings to factory defaults"
resetSettingsLabel            // "Impeller AI: 重設所有設定 (Reset Settings)" for command palette
resetSettingsConfirm          // confirm dialog text
resetSettingsDone             // "✅ 設定已重設為預設值" / "✅ Settings reset to defaults"
```

### 2. `src/main.ts` — Rebuild settings schema

Replace the current `logseq.useSettingsSchema([...])` block with the following structure:

```
Heading: 🔑 Connection (type: 'heading')
  apiKey        — type: 'string', default: ""
  model         — type: 'string', default: "openai/gpt-4o-mini"
                  description: includes zh-TW + en list of popular models
  basePath      — type: 'enum', enumChoices: [
                    "https://openrouter.ai/api/v1",
                    "https://api.openai.com/v1",
                    "https://api.anthropic.com/v1",
                    "http://localhost:11434/v1"
                  ], enumPicker: 'select', default: "https://openrouter.ai/api/v1"

Heading: ⚙️ Behavior (type: 'heading')
  tag           — type: 'string', default: per i18n tagDefault
  temperature   — type: 'number', default: 0.7
                  inputAs: 'range' (renders as a slider, 0–1)
  maxIterations — type: 'number', default: 7
  systemPromptOverride — type: 'string', inputAs: 'textarea', default: ""

Heading: 🔬 Advanced Features (type: 'heading')
  enableSemanticSearch — type: 'boolean', default: true
  enableWebSearch      — type: 'boolean', default: false
  webApiKey            — type: 'string', default: ""
```

Note: `temperature` with `inputAs: 'range'` renders a slider. However, Logseq's range input does not natively accept min/max/step attributes. A `type: 'number'` fallback is safe; the user can check if range actually renders correctly and revert to `'number'` if not.

Add the "Reset to Defaults" command palette entry after the `useSettingsSchema` call:

```typescript
logseq.App.registerCommandPalette({
  key: 'reset-settings',
  label: state.t.resetSettingsLabel,
}, async () => {
  if (!confirm(state.t.resetSettingsConfirm)) return;
  await actions.resetSettings();
});
```

Update `onSettingsChanged` to log the change (existing handler is already adequate; add a comment noting new fields).

### 3. `src/actions.ts` — Add `resetSettings` action

Add to the `actions` object:

```typescript
async resetSettings() {
  logseq.updateSettings({
    apiKey: "",
    model: "openai/gpt-4o-mini",
    basePath: "https://openrouter.ai/api/v1",
    tag: state.t.tagDefault,
    temperature: 0.7,
    maxIterations: 7,
    systemPromptOverride: "",
    enableSemanticSearch: true,
    enableWebSearch: false,
    webApiKey: "",
  });
  logseq.UI.showMsg(state.t.resetSettingsDone, 'success');
},
```

### 4. `src/ui/components.ts` — Reset button in header

In `buildHeader()`, add a small settings-reset button next to the existing close button:

```html
<a data-on-click="resetSettings"
   title="Reset settings to defaults"
   style="opacity: 0.4; padding: 4px; cursor: pointer; font-size: 11px;">↺</a>
```

Place it between the title span and the `✕` close button. Keep it subtle (low opacity, small).

The click is routed through `provideModel` which already includes `actions`, so `data-on-click="resetSettings"` will work once `resetSettings` is added to `actions`.

### 5. `src/agent.ts` — Use `temperature` setting

In `agent.ask()`, when building `requestBody`, add temperature:

```typescript
const temperature: number = (logseq.settings?.temperature as number) ?? 0.7;
const requestBody: any = { model, messages: currentMessages, temperature };
```

### 6. `src/tools.ts` — Honor `enableSemanticSearch` and `enableWebSearch`

In `getAvailableTools()`:

- Replace the `if (settings?.webApiKey)` guard for `web_search` with:
  ```typescript
  if (settings?.enableWebSearch && settings?.webApiKey) { ... }
  ```
- Wrap `semantic_search` and `graph_tag_search` tools in:
  ```typescript
  if (settings?.enableSemanticSearch !== false) { ... }
  ```

### 7. `src/prompts.ts` — Honor `systemPromptOverride`

In `buildSystemPrompt()`, at the top, check:

```typescript
const override = (logseq.settings?.systemPromptOverride as string)?.trim();
if (override) {
  // Prepend override as an additional section, or fully replace base sections
  // Decision: Prepend as ### 0. USER CUSTOM INSTRUCTIONS so it takes priority
  systemPromptParts.unshift(`### 0. CUSTOM INSTRUCTIONS\n${override}`);
}
```

This means the override *adds* to (not replaces) the built-in prompt sections, since the built-in sections (time context, tool usage, citation rules) remain useful. If the user wants to override the base entirely, they can include instructions like "Ignore all previous system instructions."

---

## i18n Key Reference (all new keys)

| Key | zh-TW | en |
|---|---|---|
| `settingHeadingConnection` | (heading title only, no desc) | same |
| `settingHeadingBehavior` | same | same |
| `settingHeadingAdvanced` | same | same |
| `settingTemperatureDesc` | "控制 AI 創造性。0.0 最精確，1.0 最有創意。(預設: 0.7)" | "Controls AI creativity. 0.0 = precise, 1.0 = creative. (Default: 0.7)" |
| `settingSystemPromptDesc` | "自訂 AI 系統提示詞。留空則使用內建提示（推薦）。此處的指令會優先覆蓋預設行為。" | "Custom AI system prompt. Leave blank to use the built-in prompt (recommended). Instructions here override default behavior." |
| `settingEnableSemanticDesc` | "啟用本地知識庫語意搜尋 (RAG)。停用可加快回應速度。" | "Enable local knowledge base semantic search (RAG). Disable to speed up responses." |
| `settingEnableWebSearchDesc` | "啟用 AI 聯網搜尋功能。需搭配下方的 Web Search API Key 才能生效。" | "Enable AI web search. Requires a valid Web Search API Key below." |
| `resetSettingsLabel` | "Impeller AI: 重設所有設定 (Reset All Settings)" | same |
| `resetSettingsConfirm` | "確定要將所有設定重設為預設值嗎？此動作無法復原。" | "Are you sure you want to reset all settings to defaults? This cannot be undone." |
| `resetSettingsDone` | "✅ 設定已重設為預設值" | "✅ Settings reset to defaults" |

Note: Heading `type: 'heading'` fields use `title` for the header text and `description` for subtext. The title text is hardcoded (not from i18n) since `useSettingsSchema` is called once at startup before full i18n is applied. However, the `title` strings are short enough to be bilingual inline (e.g., `"🔑 Connection / 連線設定"`).

---

## Validation Steps

1. Build with `npm run build` — no TypeScript errors
2. Load plugin in Logseq → open Settings → verify 3 section headings appear
3. Verify `basePath` renders as a dropdown with 4 options
4. Verify `temperature` renders (as range slider or number input)
5. Verify `enableSemanticSearch` and `enableWebSearch` render as toggles
6. Open command palette → search "Reset" → trigger reset → confirm dialog appears → after confirm, settings revert to defaults
7. Click `↺` button in sidebar header → same reset flow
8. Set `systemPromptOverride` to a custom string → verify it prepends to system prompt in `console.log`
9. Set `enableSemanticSearch: false` → verify `semantic_search` tool no longer appears in tool array (`console.log` in `ask()`)
10. Both zh-TW and en Logseq UI show correct translated descriptions

## Open Questions (out of scope for this plan)

- `temperature` range slider: Logseq's `inputAs: 'range'` may not honor min/max/step for number type. If it renders badly, fall back to `type: 'number'` without `inputAs`.
- Future: per-field reset buttons (not possible with current Logseq schema API).
