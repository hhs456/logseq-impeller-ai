// src/memory.ts
import { state } from './config';

const STORAGE_PREFIX = "impeller_chat_"; 

export const MemoryManager = {
    // 💡 核心修正 1：動態產生當前活躍圖表（Graph）專屬的儲存前綴，達成多圖表記憶完全隔離
    getGraphPrefix(): string {
        try {
            // 確保 graphPath 存在
            const graphPath = (state.currentGraphPath && typeof state.currentGraphPath === 'string') 
                ? state.currentGraphPath 
                : 'default';

            // 核心修改：使用 encodeURIComponent 處理路徑
            // 這樣「我的筆記」會變成 "%E6%88%91%E7%9A%84%E7%AD%86%E8%A8%98"
            // 這在 URL 和 LocalStorage Key 中都是絕對合法且唯一的
            const encodedGraphId = encodeURIComponent(graphPath).replace(/%/g, '_');
            
            // 為了避免過長，我們保留前 30 個字元加上 hash 或直接使用編碼後名稱
            // 這裡直接使用編碼後的字串作為唯一識別
            return `${STORAGE_PREFIX}${encodedGraphId}_`;
        } catch (err) {
            console.error("[Memory] 生成圖表字首失敗，使用 fallback", err);
            return `${STORAGE_PREFIX}fallback_`;
        }
    },

    saveHistory(targetUuid: string) {
        if (!targetUuid || !state.chatStore[targetUuid]) return;
        try {
            // 💡 核心修正 2：儲存金鑰綁定圖表路徑字首
            const key = this.getGraphPrefix() + targetUuid;
            localStorage.setItem(key, JSON.stringify(state.chatStore[targetUuid]));
        } catch (err) {
            console.error("[Memory] 寫入持久化記憶失敗", err);
        }
    },

    loadHistory(targetUuid: string) {
        try {
            // 💡 核心修正 3：讀取金鑰綁定圖表路徑字首
            const key = this.getGraphPrefix() + targetUuid;
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (err) {
            console.error("[Memory] 讀取持久化記憶失敗", err);
            return null;
        }
    },

    clearHistory(targetUuid: string) {
        try {
            const key = this.getGraphPrefix() + targetUuid;
            localStorage.removeItem(key);
        } catch (err) {
            console.error("[Memory] 清除歷史記憶失敗", err);
        }
    },

    // 💡 核心修正 4：遍歷硬碟時，【精準過濾】只撈出開頭符合「當前圖表字首」的對話清單！
    getAllSavedPages() {
        const pages: { uuid: string, name: string }[] = [];
        try {
            const currentPrefix = this.getGraphPrefix();
            
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                
                // 🔒 關鍵防線：只有當 key 是以目前這個圖表的路徑字首開頭時，才撈出來
                if (key && key.startsWith(currentPrefix)) {
                    const uuid = key.slice(currentPrefix.length);
                    const raw = localStorage.getItem(key);
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        if (parsed && parsed.name && parsed.msgs && parsed.msgs.length > 0) {
                            pages.push({ uuid, name: parsed.name });
                        }
                    }
                }
            }
        } catch (err) {
            console.error("[Memory] 獲取歷史記憶清單失敗:", err);
        }
        return pages;
    },

    buildApiPayload(targetUuid: string, maxHistory: number = 12) {
        const chatData = state.chatStore[targetUuid];
        const fullHistory = chatData?.msgs || [];
        const recentHistory = fullHistory.length > maxHistory ? fullHistory.slice(-maxHistory) : fullHistory;

        if (chatData?.summary) {
            return [
                { role: "system", content: `【長期記憶摘要】：\n${chatData.summary}` },
                ...recentHistory
            ];
        }
        return recentHistory;
    },

    async compressIfNeeded(targetUuid: string, aiCaller: Function) {
        const chatData = state.chatStore[targetUuid];
        const THRESHOLD = 14; 

        if (!chatData || chatData.msgs.length <= THRESHOLD) return;

        const oldMessages = chatData.msgs.slice(0, -6);
        const existingSummary = chatData.summary ? `過去摘要：\n${chatData.summary}\n\n` : '';
        const compressPrompt = `你是一個記憶整理專家。請將以下對話內容濃縮成精華摘要。保留重要決策、事實與使用者偏好，排除閒聊。請直接輸出摘要內容。`;

        const newSummary = await aiCaller([
            { role: "system", content: compressPrompt },
            { role: "user", content: `${existingSummary}需要加入更新的舊對話：\n${JSON.stringify(oldMessages)}` }
        ], false);

        if (newSummary) {
            state.chatStore[targetUuid].summary = newSummary;
            this.saveHistory(targetUuid);
        }
    }
};