// src/types.ts

// 💡 1. 單筆對話訊息的定義
export interface ChatMessage {
    // 🎯 擴充角色：加入了 'tool'
    role: 'user' | 'assistant' | 'system' | 'tool';
    // 工具回傳的內容或使用者的輸入
    content: string;
    
    // 🎯 下面這些是 Tool Calling 專用的可選 (?) 屬性
    tool_calls?: any[];       // 當 assistant 決定呼叫工具時會有這個陣列
    tool_call_id?: string;    // 當 tool 回傳結果時，用來對應是哪一個工具的 ID
    name?: string;            // 工具的名稱 (例如 'web_search')
    timestamp?: number;       // 👈 新增這行！相容舊對話的時間戳記
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
    t: any; 
    abortController: AbortController | null; 
    timer: NodeJS.Timeout | null | any;
    processingPageUuid: string | null;
}