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
        settingTagDesc: "AI 輸出結果時自動加上標籤或標題 (預設: 🤖 AI 處理結果)"
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
        settingTagDesc: "Custom tag or header for AI output (Default: 🤖 AI Result)"
    }
};

export const state: AppState = {
    chatStore: {}, 
    currentPageUuid: null, 
    isBusy: false, 
    isVisible: false, 
    isCollapsed: false,
    tempInput: "", 
    t: null, 
    abortController: null, 
    timer: null,
    processingPageUuid: null
};