// src/types.ts
export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
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