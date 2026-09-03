// src/main.ts
import '@logseq/libs';
import { state, I18N } from './config';
import { panel } from './panel';
import { agent } from './agent';
import { actions } from './actions';
import { renderUI } from './ui';
import { syncVectorDB } from './rag';
import { getStaticPromptParts } from './prompts';
import { encryptApiKey, decryptApiKey, AES_PREFIX } from './utils/crypto';

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
            key: "headingConnection",
            type: "heading",
            title: state.t.settingHeadingConnection,
            description: "",
            default: null,
        },
        {
            key: "apiKey",
            type: "string",
            title: "API Key",
            description: state.t.settingApiKeyDesc,
            default: ""
        },
        {
            key: "showApiKey",
            type: "boolean",
            title: "👁️ 顯示 API Key（明碼）",
            description: "開啟後會在訊息中短暫顯示明碼 Key，隨後自動關閉此選項",
            default: false
        },
        {
            key: "model",
            type: "string",
            title: "Model",
            description: state.t.settingModelDesc,
            default: "openai/gpt-4o-mini"
        },
        {
            key: "basePath",
            type: "string",
            title: "API Endpoint",
            description: state.t.settingBasePathDesc,
            default: "https://openrouter.ai/api/v1"
        },
        {
            key: "headingBehavior",
            type: "heading",
            title: state.t.settingHeadingBehavior,
            description: "",
            default: null,
        },
        {
            key: "tag",
            type: "string",
            title: "Custom Tag",
            description: state.t.settingTagDesc,
            default: state.t.tagDefault
        },
        {
            key: "temperature",
            type: "number",
            title: "Temperature",
            description: state.t.settingTemperatureDesc,
            default: 0.7
        },
        {
            key: "maxIterations",
            type: "number",
            title: "Max Iterations",
            description: state.t.settingMaxIterationsDesc,
            default: 7
        },
        {
            key: "systemPromptOverride",
            type: "string",
            title: "System Prompt Override",
            description: state.t.settingSystemPromptDesc,
            default: getStaticPromptParts(state.t.langName).join('\n\n'),
            inputAs: "textarea"
        },
        {
            key: "reasoningEffort",
            type: "string",
            title: "Reasoning Effort",
            description: state.t.settingReasoningEffortDesc,
            default: ""
        },
        {
            key: "headingAdvanced",
            type: "heading",
            title: state.t.settingHeadingAdvanced,
            description: "",
            default: null,
        },
        {
            key: "enableSemanticSearch",
            type: "boolean",
            title: "Enable Semantic Search (RAG)",
            description: state.t.settingEnableSemanticDesc,
            default: true
        },
        {
            key: "enableWebSearch",
            type: "boolean",
            title: "Enable Web Search",
            description: state.t.settingEnableWebSearchDesc,
            default: false
        },
        {
            key: "webApiKey",
            type: "string",
            title: "Web Search API Key",
            description: state.t.settingWebApiKeyDesc,
            default: ""
        },
        {
            key: "showWebApiKey",
            type: "boolean",
            title: "👁️ 顯示 Web Search API Key（明碼）",
            description: "開啟後會在訊息中短暫顯示明碼 Key，隨後自動關閉此選項",
            default: false
        }
    ]);

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

    // ✅ [改善4] 監聽設定變更，確保 API Key / Model 等異動後即時生效，無需重啟插件
    logseq.onSettingsChanged((newSettings) => {
        // 即時加密 API Key（使用者換 key 時立刻加密，避免明文暴露）
        // 注意：這裡假設輸入是明文，因為舊格式已在 migrateApiKeys 中遷移
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

        // 顯示 API Key 明碼（使用者開啟 toggle 時觸發）
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
        if (newSettings.showWebApiKey) {
            const key = newSettings.webApiKey as string;
            if (key) {
                decryptApiKey(key).then(decrypted => {
                    if (decrypted) {
                        logseq.UI.showMsg(`🔑 Web Search API Key: ${decrypted}`, 'info', { timeout: 15000 });
                    }
                });
            }
            logseq.updateSettings({ showWebApiKey: false });
        }

        if (newSettings.basePath) {
            try {
                const url = new URL(newSettings.basePath as string);
                if (!['http:', 'https:'].includes(url.protocol)) {
                    logseq.UI.showMsg('⚠️ API Endpoint 的協定不是 http/https，請確認設定', 'warning');
                } else if (url.protocol === 'http:') {
                    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
                    if (!isLocalhost) {
                        logseq.UI.showMsg('⚠️ 安全警告：您使用了非加密的 http:// 連線到非本機端點。API Key 將以明文傳輸，可能被竊取。建議改用 https://。', 'warning');
                    }
                }
            } catch {
                logseq.UI.showMsg('⚠️ API Endpoint URL 格式無效，請確認設定', 'warning');
            }
        }
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

    logseq.App.registerCommandPalette({
        key: 'reset-settings',
        label: state.t.resetSettingsLabel,
    }, async () => {
        await actions.resetSettings();
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