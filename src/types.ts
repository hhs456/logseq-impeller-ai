// src/types.ts
import type { I18NKey } from './i18n';

export interface ToolCallFunction {
    name: string;
    arguments: string;
}

export interface ToolCall {
    id: string;
    type: 'function';
    function: ToolCallFunction;
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
    name?: string;
    timestamp?: number;
}

// 💡 2. 單一頁面对話庫的定義 (改為定義單頁的內容)
export interface PageChat {
    name: string;
    msgs: ChatMessage[];
    summary?: string;         // 👈 新增：專門給 API 看的滾動摘要，UI 碰不到它
}

// 💡 3. 全域 AppState 的定義
export interface AppState {
    // 這裡使用 Record<string, PageChat>，完美對應 state.chatStore[uuid].msgs 的用法
    chatStore: Record<string, PageChat>; 
    currentPageUuid: string | null; 
    currentGraphPath: string | null; // 💡 新增：當前 Logseq 圖表的實體路徑沙盒
    isBusy: boolean; 
    isVisible: boolean; 
    isCollapsed: boolean;
    isMemoryCollapsed: boolean;      // 💡 新增：記錄記憶庫是否折疊
    tempInput: string; 
    t: Record<I18NKey, string> | null; 
    abortController: AbortController | null; 
    timer: NodeJS.Timeout | null | any;
    processingPageUuid: string | null;
}