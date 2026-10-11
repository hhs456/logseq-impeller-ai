// src/memory.ts
import { state } from './config';
import { obfuscate, deobfuscate } from './utils/obfuscate';
import { logger } from './utils/logger';

const CHAT_PREFIX = "impeller_chat_";
const IDX_PREFIX = "impeller_idx_";   // N8：index key 不得以 impeller_chat_ 開頭

interface IndexEntry { name: string; count: number; }
type ChatIndex = Record<string, IndexEntry>;

export const MemoryManager = {
    // 記憶體快取：避免每次 render 全掃描 localStorage
    _cache: {
        graphId: null as string | null,
        pages: [] as { uuid: string; name: string }[],
        dirty: true,
        version: 0,
    },

    // 💡 動態產生當前活躍圖表（Graph）專屬的編碼 ID
    getEncodedGraphId(): string {
        const graphPath = (state.currentGraphPath && typeof state.currentGraphPath === 'string')
            ? state.currentGraphPath
            : 'default';
        return encodeURIComponent(graphPath).replace(/%/g, '_');
    },

    getGraphPrefix(): string {
        try {
            return `${CHAT_PREFIX}${this.getEncodedGraphId()}_`;
        } catch (err) {
            logger.error("[Memory] 生成圖表字首失敗，使用 fallback", err);
            return `${CHAT_PREFIX}fallback_`;
        }
    },

    getIndexKey(): string {
        try {
            return `${IDX_PREFIX}${this.getEncodedGraphId()}`;
        } catch {
            return `${IDX_PREFIX}fallback`;
        }
    },

    getIndexVersion(): number {
        return this._cache.version;
    },

    invalidateMemoryIndex() {
        this._cache.graphId = null;
        this._cache.pages = [];
        this._cache.dirty = true;
    },

    _readIndex(): ChatIndex | null {
        try {
            const raw = localStorage.getItem(this.getIndexKey());
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object') ? parsed as ChatIndex : null;
        } catch {
            return null;
        }
    },

    _writeIndex(idx: ChatIndex) {
        try {
            localStorage.setItem(this.getIndexKey(), JSON.stringify(idx));
            this._cache.dirty = true;
            this._cache.version++;
        } catch (err) {
            logger.error("[Memory] 寫入索引失敗", err);
        }
    },

    _indexSet(uuid: string, name: string, count: number) {
        const idx = this._readIndex() ?? {};
        idx[uuid] = { name, count };
        this._writeIndex(idx);
    },

    _indexRemove(uuid: string) {
        const idx = this._readIndex();
        if (!idx) return;
        delete idx[uuid];
        this._writeIndex(idx);
    },

    saveHistory(targetUuid: string) {
        if (!targetUuid || !state.chatStore[targetUuid]) return;
        try {
            const key = this.getGraphPrefix() + targetUuid;
            const chat = state.chatStore[targetUuid];
            localStorage.setItem(key, obfuscate(JSON.stringify(chat)));
            this._indexSet(targetUuid, chat.name, chat.msgs.length);
        } catch (err) {
            logger.error("[Memory] 寫入持久化記憶失敗", err);
        }
    },

    loadHistory(targetUuid: string) {
        try {
            const key = this.getGraphPrefix() + targetUuid;
            const data = localStorage.getItem(key);
            return data ? JSON.parse(deobfuscate(data)) : null;
        } catch (err) {
            logger.error("[Memory] 讀取持久化記憶失敗", err);
            return null;
        }
    },

    clearHistory(targetUuid: string) {
        try {
            const key = this.getGraphPrefix() + targetUuid;
            localStorage.removeItem(key);
            this._indexRemove(targetUuid);
        } catch (err) {
            logger.error("[Memory] 清除歷史記憶失敗", err);
        }
    },

    // 冷啟動：一次性全掃描，逐筆 try/catch（N8：單筆壞資料只跳過該筆）
    _legacyScan(): ChatIndex {
        const idx: ChatIndex = {};
        const currentPrefix = this.getGraphPrefix();
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith(currentPrefix)) continue;
            const uuid = key.slice(currentPrefix.length);
            try {
                const raw = localStorage.getItem(key);
                if (!raw) continue;
                const parsed = JSON.parse(deobfuscate(raw));
                if (parsed && parsed.name && Array.isArray(parsed.msgs) && parsed.msgs.length > 0) {
                    idx[uuid] = { name: parsed.name, count: parsed.msgs.length };
                }
            } catch {
                /* 跳過這一筆，不影響其他 */
            }
        }
        this._writeIndex(idx);
        return idx;
    },

    getAllSavedPages(): { uuid: string; name: string }[] {
        const graphId = this.getEncodedGraphId();
        if (this._cache.graphId === graphId && !this._cache.dirty) {
            return this._cache.pages;
        }

        let idx = this._readIndex();
        if (!idx) {
            idx = this._legacyScan();
        }

        const pages: { uuid: string; name: string }[] = [];
        for (const uuid of Object.keys(idx)) {
            const entry = idx[uuid];
            if (entry && entry.name && entry.count > 0) {
                pages.push({ uuid, name: entry.name });
            }
        }

        this._cache.graphId = graphId;
        this._cache.pages = pages;
        this._cache.dirty = false;
        return pages;
    },

    buildApiPayload(targetUuid: string, maxHistory: number = 12) {
        const chatData = state.chatStore[targetUuid];
        const fullHistory = chatData?.msgs || [];
        const recentHistory = fullHistory.length > maxHistory ? fullHistory.slice(-maxHistory) : fullHistory;

        // N7：只輸出 {role, content}，不暴漏 timestamp / trace
        const stripped = recentHistory.map(m => ({ role: m.role, content: m.content }));

        if (chatData?.summary) {
            return [
                { role: "system", content: `【長期記憶摘要】：\n${chatData.summary}` },
                ...stripped
            ];
        }
        return stripped;
    },

    // D8：只刪非當前 prefix 且符合 impeller_chat_ 的 key，回傳刪除數量（不自動觸發，僅供命令面板）
    purgeOtherGraphChats(): number {
        const currentPrefix = this.getGraphPrefix();
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(CHAT_PREFIX) && !key.startsWith(currentPrefix)) {
                keysToRemove.push(key);
            }
        }
        for (const key of keysToRemove) localStorage.removeItem(key);
        if (keysToRemove.length > 0) this.invalidateMemoryIndex();
        return keysToRemove.length;
    },

    async compressIfNeeded(
        targetUuid: string,
        aiCaller: (msgs: any[]) => Promise<{ status: 'ok' | 'aborted' | 'error'; content: string | null }>
    ): Promise<'ok' | 'aborted' | 'skipped'> {
        const chatData = state.chatStore[targetUuid];
        const THRESHOLD = 14;

        if (!chatData || chatData.msgs.length <= THRESHOLD) return 'skipped';

        const oldMessages = chatData.msgs.slice(0, -6).map(m => ({ role: m.role, content: m.content }));
        const existingSummary = chatData.summary ? `過去摘要：\n${chatData.summary}\n\n` : '';
        const compressPrompt = `你是一個記憶整理專家。請將以下對話內容濃縮成精華摘要。保留重要決策、事實與使用者偏好，排除閒聊。請直接輸出摘要內容。`;

        const res = await aiCaller([
            { role: "system", content: compressPrompt },
            { role: "user", content: `${existingSummary}需要加入更新的舊對話：\n${JSON.stringify(oldMessages)}` }
        ]);

        // N2：只有成功才寫摘要；中止／錯誤一律不污染長期記憶
        if (res.status === 'aborted') return 'aborted';
        if (res.status !== 'ok' || !res.content) return 'skipped';

        state.chatStore[targetUuid].summary = res.content;
        this.saveHistory(targetUuid);
        return 'ok';
    }
};
