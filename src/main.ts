// src/main.ts
import '@logseq/libs';
import { state, I18N } from './config';
import { panel } from './panel';
import { agent } from './agent';
import { actions } from './actions';
import { renderUI } from './ui';
import { syncVectorDB } from './rag'; // 👈 1. 改為引入全新的增量同步函式

async function main() {
    console.log("Impeller AI 外掛已載入！");

    const config = await logseq.App.getUserConfigs();
    state.t = config.preferredLanguage?.startsWith("zh") ? I18N["zh-TW"] : I18N["en"];

    logseq.useSettingsSchema([
        {
            key: "apiKey",
            type: "string",
            title: "1. API Key",
            description: state.t.settingApiKeyDesc, // 👈 使用 i18n
            default: ""
        },
        {
            key: "model",
            type: "string",
            title: "2. Model",
            description: state.t.settingModelDesc, // 👈 使用 i18n
            default: "openai/gpt-4o-mini"
        },
        {
            key: "basePath",
            type: "string",
            title: "3. API Endpoint",
            description: state.t.settingBasePathDesc, // 👈 使用 i18n
            default: "https://openrouter.ai/api/v1"
        },
        {
            key: "tag",
            type: "string",
            title: "4. Custom Tag",
            description: state.t.settingTagDesc, // 👈 使用 i18n
            default: state.t.tagDefault
        },
        {
            key: "webApiKey",
            type: "string",
            title: "5. Web Search API Key",
            description: state.t.settingWebApiKeyDesc, // 👈 使用 i18n
            default: "",
        }
    ]);

    // 將所有行為綁定給 UI data-on-click 使用
    logseq.provideModel({
        ...actions,
        ...agent,
        ...panel
    });

    logseq.App.registerUIItem('toolbar', {
        key: 'ai-portal-btn',
        template: `<a class="button" data-on-click="togglePanel" style="font-size: 13px; font-weight: 600; padding: 0 8px; color: var(--ls-icon-color); opacity: 0.8;">${state.t.aiBtnText}</a>`
    });

    // 💡 新增：註冊匯出對話指令到 Logseq 快捷面板 (Command Palette)
    logseq.App.registerCommandPalette({
        key: 'export-ai-chat',
        label: 'Impeller AI: 匯出當前對話 (Export Chat)',
    }, async () => {
        panel.exportChat();
    });

    logseq.App.onRouteChanged(async () => {
        if (state.isVisible) {
            await actions.updatePageContext();
            renderUI();
        }
    });

    // 👈 2. 啟動時執行一次增量同步
    syncVectorDB().catch(err => console.error("向量資料庫同步失敗:", err));

    // 👈 3. 監聽跨圖譜 (Graph) 切換事件，切換時自動重新載入該圖譜的專屬向量庫！
    logseq.App.onCurrentGraphChanged(() => {
        console.log("🔄 偵測到圖譜切換，正在重新載入專屬向量資料庫...");
        syncVectorDB().catch(console.error);
    });
}

logseq.ready(main).catch(console.error);