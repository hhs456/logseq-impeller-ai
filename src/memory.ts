// src/memory.ts
import { state } from './config';

export const MemoryManager = {
    // 1. 滑動視窗：只提取最近 N 筆對話，保護 Token 額度
    getRecentHistory(targetUuid: string, maxHistory: number = 10) {
        const chatHistory = state.chatStore[targetUuid]?.msgs || [];
        return chatHistory.length > maxHistory ? chatHistory.slice(-maxHistory) : chatHistory;
    },

    // 2. 記憶壓縮：在對話過長時，將歷史濃縮為「過去對話摘要」
    async compressIfNeeded(targetUuid: string, aiCaller: Function) {
        const chatHistory = state.chatStore[targetUuid]?.msgs || [];
        const THRESHOLD = 12; // 觸發壓縮門檻
        const COMPRESS_COUNT = 6; // 每次壓縮 6 筆對話

        if (chatHistory.length <= THRESHOLD) return;

        const msgsToCompress = chatHistory.slice(0, COMPRESS_COUNT);
        const remainingMsgs = chatHistory.slice(COMPRESS_COUNT);

        const compressPrompt = `你是一個記憶整理專家。請將以下對話內容濃縮成精華摘要。保留重要決策、事實與使用者偏好，排除閒聊。請直接輸出摘要內容。`;

        const summary = await aiCaller([
            { role: "system", content: compressPrompt },
            ...msgsToCompress
        ], false);

        if (summary) {
            // 將壓縮後的摘要插入為第一筆 System 訊息
            state.chatStore[targetUuid].msgs = [
                { role: "system", content: `【過去的對話摘要】：\n${summary}` },
                ...remainingMsgs
            ];
            console.log(`[Memory] 記憶已壓縮，節省了 ${COMPRESS_COUNT} 筆歷史訊息`);
        }
    }
};