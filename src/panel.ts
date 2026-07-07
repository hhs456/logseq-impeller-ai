// src/panel.ts
import '@logseq/libs';
import { state } from './config';
import { renderUI } from './ui';
import { actions } from './actions';
import { MemoryManager } from './memory';

export const panel = {
    async togglePanel() {
        state.isVisible = !state.isVisible;
        if (state.isVisible) {
            // 💡 呼叫 command 模組來更新頁面狀態
            await actions.updatePageContext();
            await logseq.App.setRightSidebarVisible(true);
            setTimeout(() => renderUI(), 150);
        } else {
            renderUI();
        }
    },

    toggleCollapse() {
        state.isCollapsed = !state.isCollapsed;
        renderUI();
    },

    hidePanel() {
        state.isVisible = false;
        renderUI();
    },

    clearChat() {
        if (state.currentPageUuid && state.chatStore[state.currentPageUuid]) {
            // 💡 呼叫你在 config.ts 寫好的 I18N 提示
            if (!confirm(state.t.confirmClear)) return;

            state.chatStore[state.currentPageUuid].msgs = [];
            state.chatStore[state.currentPageUuid].summary = ""; // 連同摘要一起清空
            MemoryManager.clearHistory(state.currentPageUuid); 
        }
        renderUI();
    },

    // 💡 新增：切換歷史記憶庫清單的收合狀態
    toggleMemoryCollapse() {
        state.isMemoryCollapsed = !state.isMemoryCollapsed;
        renderUI();
    },
    
    async copyMsg(e: any) {
        const msgIndex = parseInt(e.dataset.index, 10);
        const pageUuid = state.currentPageUuid;

        if (!pageUuid) return;

        const msg = state.chatStore[pageUuid]?.msgs[msgIndex];

        if (msg && msg.content) {
            try {
                await window.parent.navigator.clipboard.writeText(msg.content);
                logseq.UI.showMsg('✅ 已複製對話內容', 'success');
            } catch (err) {
                const textArea = window.parent.document.createElement("textarea");
                textArea.value = msg.content;
                textArea.style.position = "fixed";
                textArea.style.opacity = "0";

                window.parent.document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();

                try {
                    const successful = window.parent.document.execCommand('copy');
                    window.parent.document.body.removeChild(textArea);

                    if (successful) {
                        logseq.UI.showMsg('✅ 已複製對話內容 (降級模式)', 'success');
                    } else {
                        throw new Error('execCommand returned false');
                    }
                } catch (fallbackErr) {
                    window.parent.document.body.removeChild(textArea);
                    console.error('複製完全失敗:', err, fallbackErr);
                    logseq.UI.showMsg('❌ 複製失敗，剪貼簿遭到系統底層封鎖', 'error');
                }
            }
        }
    },

    async deleteMsg(e: any) {
        const msgIndex = parseInt(e.dataset.index, 10);
        const pageUuid = state.currentPageUuid;

        if (!pageUuid || !state.chatStore[pageUuid]) return;

        // 💡 呼叫 I18N 提示
        if (!confirm(state.t.confirmDelete)) return;

        state.chatStore[pageUuid].msgs = state.chatStore[pageUuid].msgs.slice(0, msgIndex);
        MemoryManager.saveHistory(pageUuid); 
        
        logseq.UI.showMsg('🗑️ 已刪除該訊息及後續對話', 'info');
        renderUI();
    },

    async exportChat() {
        const targetUuid = state.currentPageUuid;
        if (!targetUuid || !state.chatStore[targetUuid] || state.chatStore[targetUuid].msgs.length === 0) {
            logseq.UI.showMsg(state.t.exportNoChat || "目前沒有對話可以匯出喔！", 'warning');
            return;
        }

        const chat = state.chatStore[targetUuid];
        const markdownContent = `# AI Chat: ${chat.name}\n\n` + chat.msgs.map(m => {
            const roleStr = m.role as string;
            const roleName = roleStr === 'user' ? '🧑 **You**' : (roleStr === 'tool' ? '🛠️ **System**' : '🤖 **AI**');
            
            // 💡 匯出時也格式化時間
            const timeStr = m.timestamp ? ` _(${new Date(m.timestamp).toLocaleString()})_` : '';
            
            return `${roleName}${timeStr}:\n${m.content}`;
        }).join('\n\n---\n\n');

        const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = window.parent.document.createElement('a'); 
        a.href = url;
        a.download = `Impeller_Chat_${chat.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}.md`;
        a.click();
        URL.revokeObjectURL(url);

        const successMsg = (state.t.exportSuccess || `✅ 已匯出對話：{name}`).replace('{name}', chat.name);
        logseq.UI.showMsg(successMsg, 'success');
    }
};