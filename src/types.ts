// src/types.ts

export interface ChatMessage {
    // 🎯 擴充角色：加入了 'tool'
    role: 'user' | 'assistant' | 'system' | 'tool';
    // 工具回傳的內容或使用者的輸入
    content: string;
    
    // 🎯 下面這些是 Tool Calling 專用的可選 (?) 屬性
    tool_calls?: any[];       // 當 assistant 決定呼叫工具時會有這個陣列
    tool_call_id?: string;    // 當 tool 回傳結果時，用來對應是哪一個工具的 ID
    name?: string;            // 工具的名稱 (例如 'web_search')
}

export interface ChatStore {
    [uuid: string]: {
        name: string;
        msgs: ChatMessage[];
    };
}

export interface AppState {
    chatStore: ChatStore;
    currentPageUuid: string | null;
    isBusy: boolean;
    isVisible: boolean;
    isCollapsed: boolean;
    tempInput: string;
    t: any; // 存放當前語系物件
    abortController: AbortController | null;
    timer: ReturnType<typeof setInterval> | null;
    processingPageUuid: string | null;
}