// src/ui.ts
import '@logseq/libs';
import { state } from './config';
import { agent } from './agent';
import { SIDEBAR_CSS } from './ui/styles';
import { buildHeader, buildMemorySection, buildChatHistory, buildInputArea } from './ui/components';

let stylesInjected = false;

export function renderUI() {
    if (!state.isVisible) {
        logseq.provideUI({ key: 'ai-sidebar', template: '' });
        return;
    }

    if (!stylesInjected) {
        logseq.provideStyle({ key: 'ai-sidebar-styles', style: SIDEBAR_CSS });
        stylesInjected = true;
    }

    const currentData = state.currentPageUuid && state.chatStore[state.currentPageUuid]
        ? state.chatStore[state.currentPageUuid]
        : { msgs: [] };
    
    let busyMessage = state.t.thinking;
    if (state.isBusy && state.processingPageUuid && state.processingPageUuid !== state.currentPageUuid) {
        const processingName = state.chatStore[state.processingPageUuid]?.name || state.t.bgPage;
        busyMessage = state.t.processingOther.replace('{name}', processingName);
    }

    // 💡 智慧滾動條偵測 (在重新渲染 DOM 之前捕獲狀態)
    const historyEl = parent.document.getElementById('ai-sidebar-history');
    let shouldScrollToBottom = true; 
    let savedScrollTop = 0;

    if (historyEl) {
        const threshold = 30; // 允許 30px 的邊界誤差
        const isAtBottom = (historyEl.scrollHeight - historyEl.scrollTop - historyEl.clientHeight) <= threshold;
        shouldScrollToBottom = isAtBottom;
        savedScrollTop = historyEl.scrollTop;
    }

    // 4. 重組模板 (外框高度動態化，解決收摺失敗的問題)
    const template = `
        <div id="ai-sidebar-container" style="display: flex; flex-direction: column; ${state.isCollapsed ? 'height: auto;' : 'height: calc(100vh - 100px); min-height: 400px;'} box-sizing: border-box; padding: 10px;">
            <div style="display: flex; flex-direction: column; ${state.isCollapsed ? '' : 'height: 100%;'} background: var(--ls-primary-background-color); border: 1px solid var(--ls-border-color); border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                
                ${buildHeader(state.isCollapsed, state.t.aiBtnText)}
                
                <div style="display: ${state.isCollapsed ? 'none' : 'flex'}; flex-direction: column; flex: 1; overflow: hidden;">
                    ${buildMemorySection(state.isMemoryCollapsed)}
                    
                    ${buildChatHistory(currentData.msgs, state.isBusy, busyMessage, state.t.welcome)}
                    
                    ${buildInputArea(state.t.placeholder, state.isBusy)}
                </div>
            </div>
        </div>
    `;

    logseq.provideUI({ key: 'ai-sidebar', path: '#right-sidebar .sidebar-item-list', template });
    setupEventListeners();

    // 💡 智慧滾動條控制 (DOM 更新後無感修正位置)
    setTimeout(() => {
        const newHistoryEl = parent.document.getElementById('ai-sidebar-history');
        if (newHistoryEl) {
            if (shouldScrollToBottom) {
                newHistoryEl.scrollTop = newHistoryEl.scrollHeight; // 新對話來時自動跟隨到最下方
            } else {
                newHistoryEl.scrollTop = savedScrollTop; // 用戶往上翻閱時，固定在原位不動
            }
        }
    }, 40);
}

function setupEventListeners() {
    setTimeout(() => {
        const textarea = parent.document.getElementById('ai-sidebar-textarea') as HTMLTextAreaElement;
        if (textarea) {
            textarea.value = state.tempInput;
            textarea.oninput = (e: any) => { state.tempInput = e.target.value; };
            textarea.onkeydown = (e) => {
                // 防止上下鍵干擾 Logseq 原生快捷鍵
                if (["ArrowUp", "ArrowDown", "Enter"].includes(e.key)) e.stopPropagation();
                
                // 偵測 Enter 鍵 (且沒有按住 Shift)
                if (e.key === "Enter" && !e.shiftKey && !state.isBusy) {
                    e.preventDefault(); // 阻止原生的換行行為
                    
                    // 💡 修正：不要在這裡清空 state.tempInput！
                    // 直接觸發發送按鈕，讓底層的 sendMsg 函數去讀取並清空
                    const sendBtn = parent.document.querySelector('[data-on-click="sendMsg"]') as HTMLElement;
                    if (sendBtn) sendBtn.click();
                }
            };
            
            // 如果 AI 沒在忙，自動聚焦輸入框
            if (!state.isBusy) textarea.focus();
        }
    }, 100);
}