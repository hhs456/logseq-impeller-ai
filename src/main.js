// src/main.ts
import '@logseq/libs';
import { state, I18N } from './config';
import { actions } from './actions';
import { renderUI } from './ui';
async function main() {
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
        }
    ]);
    // 將所有行為綁定給 UI data-on-click 使用
    logseq.provideModel(actions);
    logseq.App.registerUIItem('toolbar', {
        key: 'ai-portal-btn',
        template: `<a class="button" data-on-click="togglePortal" style="font-size: 13px; font-weight: 600; padding: 0 8px; color: var(--ls-icon-color); opacity: 0.8;">${state.t.aiBtnText}</a>`
    });
    logseq.App.onRouteChanged(async () => {
        if (state.isVisible) {
            await actions.updatePageContext();
            renderUI();
        }
    });
}
logseq.ready(main).catch(console.error);
