// src/config.ts
import { AppState } from './types';

export const I18N = {
    "zh-TW": {
        langName: "繁體中文 (Traditional Chinese)",
        baseCondition: "你是一個 Logseq 專家。請產出結構化的 Markdown 縮排清單。嚴禁廢話。保留 [[雙向連結]] 與 #標籤。",
        applyReformat: "【任務：純重構】目前無對話指令。請僅優化目前頁面的縮排架構，不要增加新資訊。必須嚴格使用 '-' 作為清單開頭，並以空格縮排呈現層級。",
        applyContext: "【任務：智慧執行】請分析對話紀錄：\n1. 若用戶要求『重構』或『整理』全文，請輸出重構後的完整 Markdown 縮排清單。\n2. 若用戶要求『補充』、『延伸』或『新增』，請僅輸出新產出的 Markdown 縮排清單。\n\n[輸出規範]\n- 只能使用 '-' 開頭的縮排清單格式（例如 - 項目）。\n- 嚴禁輸出任何 ``` 區塊標記。\n- 絕對不要有任何前言或解釋性文字。",
        welcome: "🤖 AI 助理已就緒。可以開始對話或點擊「套用」。",
        thinking: "⏳ AI 正在構思中...",
        working: "⏳ AI 正在執行智慧套用，請稍候...",
        done: "✅ 處理完成",
        stopBtn: "⏹️",
        applyBtn: "✨ 套用",
        clearBtn: "🗑️",
        placeholder: "輸入需求 (Enter 傳送 / Shift+Enter 換行)...",
        tagDefault: "🤖 AI 處理結果",
        error: "❌ 錯誤: ",
        aiBtnText: "AI 助理",
        aborted: "⚠️ 任務已手動中斷",
        processingOther: "⏳ 正在為「{name}」處理中...",
        bgPage: "背景頁面",            
        bgChatDone: "💬 「{name}」的 AI 回應已準備就緒",
        // 👇 新增：設定頁面的描述
        settingApiKeyDesc: "請填入你的 LLM API Key (如 OpenAI, OpenRouter 等)",
        settingModelDesc: "設定你要使用的模型名稱 (例如: openai/gpt-4o-mini)",
        settingBasePathDesc: "若使用本地端 (如 Ollama) 或代理伺服器，請在此更改 API 端點",
        settingTagDesc: "AI 輸出結果時自動加上標籤或標題 (預設: 🤖 AI 處理結果)",
        settingWebApiKeyDesc: "請輸入您的搜尋引擎 API Key（用於啟用 AI 聯網搜尋技能）",
        settingMaxIterationsDesc: "決定 AI 每回合最多可連續自動翻閱檔案或搜尋的次數。(預設: 7)",
        // --- RAG 與向量搜尋相關 ---
        ragInitModel: "🧠 首次載入或更新模型中，需稍候 (約 90MB)...",
        ragIndexing: "⏳ 發現 {count} 筆新筆記或修改，正在建立神經索引...",
        ragSyncDone: "✅ 增量更新完成！",
        ragSyncFailed: "❌ 本地 AI 大腦啟動失敗",
        ragNoRefsFound: "知識庫中沒有找到與 [[{targetPage}]] 關聯的筆記。",
        ragRefsFound: "以下是所有關聯到 [[{targetPage}]] 的筆記：\n",
        ragQueryError: "查詢 [[{targetPage}]] 時發生錯誤。",
        // --- 匯出功能 ---
        exportNoChat: "目前沒有對話可以匯出喔！",
        exportSuccess: "✅ 已匯出對話：{name}",
        confirmClear: "確定要清空這頁的所有 AI 對話紀錄嗎？此動作無法復原！",
        confirmDelete: "確定要刪除這則訊息嗎？\n⚠️ 注意：這將會一併清除此訊息之後的「所有」對話紀錄！",
        confirmRegenerate: "確定要讓 AI 重新回答嗎？\n⚠️ 注意：這將會捨棄這則回答之後的「所有」對話紀錄！"
    },
    "en": {
        langName: "English",
        baseCondition: "Logseq expert. Use structured Markdown lists. Preserve [[Backlinks]] and #Tags.",
        applyReformat: "Intent: Pure Reformat. Optimize indentation only using '-' as list bullet.",
        applyContext: "Intent: Smart Apply.\n1. If history asks for 'refactor', output full page as indented Markdown list.\n2. If history asks for 'addition' or 'ideas', output ONLY the new blocks.\n\n[Output Rules]\n- Use ONLY '-' for list items.\n- NO ``` block markers.\n- NO introductory or concluding text.",
        welcome: "🤖 AI Assistant ready. Chat or click 'Apply'.",
        thinking: "⏳ AI is thinking...",
        working: "⏳ AI is applying changes...",
        done: "✅ Done",
        stopBtn: "⏹️",
        applyBtn: "✨ Apply",
        clearBtn: "🗑️",
        placeholder: "Enter needs...",
        tagDefault: "🤖 AI Result",
        error: "❌ Error: ",
        aiBtnText: "AI Assistant",
        aborted: "⚠️ Task aborted",
        processingOther: "⏳ Processing for '{name}'...",
        bgPage: "Background Page",            
        bgChatDone: "💬 AI response for '{name}' is ready",
        // 👇 新增：設定頁面的描述
        settingApiKeyDesc: "Enter your LLM API Key (e.g., OpenAI, OpenRouter)",
        settingModelDesc: "Set the model name you want to use (e.g., openai/gpt-4o-mini)",
        settingBasePathDesc: "Change the API endpoint if using a local server (like Ollama) or proxy",
        settingTagDesc: "Custom tag or header for AI output (Default: 🤖 AI Result)",
        settingWebApiKeyDesc: "Please enter your search engine API key (to enable the AI web search skill).",
        settingMaxIterationsDesc: "Set the maximum number of consecutive tool uses (file reading/searching) allowed per query. (Default: 7)",
        // --- RAG & Vector Search ---
        ragInitModel: "🧠 Initializing or updating model, please wait (approx. 90MB)...",
        ragIndexing: "⏳ Found {count} new or modified notes, building neural index...",
        ragSyncDone: "✅ Incremental sync completed!",
        ragSyncFailed: "❌ Failed to initialize local AI brain",
        ragNoRefsFound: "No notes found associated with [[{targetPage}]] in the knowledge base.",
        ragRefsFound: "Here are all the notes associated with [[{targetPage}]]:\n",
        ragQueryError: "An error occurred while querying [[{targetPage}]]",
        // --- Export Feature ---
        exportNoChat: "No chat history to export!",
        exportSuccess: "✅ Chat exported: {name}",
        confirmClear: "Are you sure you want to clear all AI chat history for this page? This action cannot be undone!",
        confirmDelete: "Are you sure you want to delete this message?\n⚠️ Note: This will also clear all subsequent chat history!",
        confirmRegenerate: "Are you sure you want to regenerate the AI response?\n⚠️ Note: This will discard all subsequent chat history!"
    }
};

export const state: AppState = {
    chatStore: {}, 
    currentPageUuid: null, 
    currentGraphPath: null, // 💡 初始化
    isBusy: false, 
    isVisible: false, 
    isCollapsed: false,
    isMemoryCollapsed: false,
    tempInput: "", 
    t: null, 
    abortController: null, 
    timer: null,
    processingPageUuid: null
};