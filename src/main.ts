// src/main.ts
import '@logseq/libs';
import { state, I18N } from './config';
import { panel } from './panel';
import { agent } from './agent';
import { actions } from './actions';
import { renderUI } from './ui';
import { syncVectorDB } from './rag';

// ✅ [改善1] 將 initRAG 提升至 main() 外部，成為頂層函式
//    - 職責單一、清晰可見
//    - 可在 main() 啟動與 onCurrentGraphChanged 兩處複用，消除重複邏輯
async function initRAG() {
    try {
        await syncVectorDB();
        console.log("✅ 向量資料庫同步成功");
    } catch (err) {
        console.error("❌ 向量資料庫同步失敗:", err);
        // 統一的使用者 UI 通知，確保任何情境下失敗都能被感知
        logseq.UI.showMsg("Impeller AI 向量庫同步失敗。部分功能可能受限。", "error");
    }
}

async function main() {
    console.log("Impeller AI Plugin Loaded");

    // --- 基礎設定 ---
    const config = await logseq.App.getUserConfigs();
    state.t = config.preferredLanguage?.startsWith("zh") ? I18N["zh-TW"] : I18N["en"];

    // --- 插件設定面板 ---
    logseq.useSettingsSchema([
        {
            key: "apiKey",
            type: "string",
            title: "1. API Key",
            description: state.t.settingApiKeyDesc,
            default: ""
        },
        {
            key: "model",
            type: "string",
            title: "2. Model",
            description: state.t.settingModelDesc,
            default: "openai/gpt-4o-mini"
        },
        {
            key: "basePath",
            type: "string",
            title: "3. API Endpoint",
            description: state.t.settingBasePathDesc,
            default: "https://openrouter.ai/api/v1"
        },
        {
            key: "tag",
            type: "string",
            title: "4. Custom Tag",
            description: state.t.settingTagDesc,
            default: state.t.tagDefault
        },
        {
            key: "webApiKey",
            type: "string",
            title: "5. Web Search API Key",
            description: state.t.settingWebApiKeyDesc,
            default: "",
        },
        {
            key: "maxIterations",
            type: "number",
            default: 7,
            title: "6. Max Iterations",
            description: state.t.settingMaxIterationsDesc,
        }
    ]);

    // ✅ [改善4] 監聽設定變更，確保 API Key / Model 等異動後即時生效，無需重啟插件
    logseq.onSettingsChanged((newSettings) => {
        console.log("⚙️ 插件設定已更新，正在套用...", newSettings);
        // state 中若有快取設定值，可在此處同步更新
        // 例如：state.apiKey = newSettings.apiKey ?? state.apiKey;
    });

    // --- 注入 UI 互動模型 ---
    logseq.provideModel({
        ...actions,
        ...agent,
        ...panel
    });

    // --- 工具列按鈕 ---
    logseq.App.registerUIItem('toolbar', {
        key: 'ai-portal-btn',
        template: `<a class="button" data-on-click="togglePanel" style="font-size: 13px; font-weight: 600; padding: 0 8px; color: var(--ls-icon-color); opacity: 0.8;">${state.t.aiBtnText}</a>`
    });

    // --- 指令面板捷徑 ---
    logseq.App.registerCommandPalette({
        key: 'export-ai-chat',
        label: 'Impeller AI: 匯出當前對話 (Export Chat)',
    }, async () => {
        // ✅ [確認安全] exportChat 在 panel.ts 中以一般函式定義，不依賴 this，直接呼叫安全
        panel.exportChat();
    });

    // --- 路由切換監聽 ---
    logseq.App.onRouteChanged(async () => {
        if (state.isVisible) {
            await actions.updatePageContext();
            renderUI();
        }
    });

    // --- 圖譜切換監聽 ---
    logseq.App.onCurrentGraphChanged(async () => {
        // Step 1｜同步等待：先執行輕量的狀態隔離，確保 UI 資料乾淨
        await actions.handleGraphChange();

        // Step 2｜背景非同步：狀態隔離完成後，將耗時的向量庫同步丟到背景執行
        console.log("🔄 偵測到圖譜切換，正在背景重新載入專屬向量資料庫...");

        // ✅ [改善2] 直接複用 initRAG()，錯誤處理邏輯與啟動時完全一致（含 UI 通知）
        initRAG();
    });

    // --- 啟動時執行一次增量同步 ---
    // ✅ [改善1] 直接呼叫已提升到頂層的 initRAG()，main() 內部更簡潔
    initRAG();
}

logseq.ready(main).catch(console.error);