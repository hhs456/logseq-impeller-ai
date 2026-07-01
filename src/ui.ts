// src/ui.ts
import '@logseq/libs';
import { state } from './config';
import { agent } from './agent';
import { SIDEBAR_CSS } from './ui/styles';
import { buildHeader, buildChatHistory, buildInputArea } from './ui/components';

let stylesInjected = false;

export function renderUI() {
    // 1. 檢查狀態
    if (!state.isVisible) {
        logseq.provideUI({ key: 'ai-sidebar', template: '' });
        return;
    }

    // 2. 注入樣式
    if (!stylesInjected) {
        logseq.provideStyle({ key: 'ai-sidebar-styles', style: SIDEBAR_CSS });
        stylesInjected = true;
    }

    // 3. 準備資料
    const currentData = state.currentPageUuid && state.chatStore[state.currentPageUuid]
        ? state.chatStore[state.currentPageUuid]
        : { msgs: [] };
    
    let busyMessage = state.t.thinking;
    if (state.isBusy && state.processingPageUuid && state.processingPageUuid !== state.currentPageUuid) {
        const processingName = state.chatStore[state.processingPageUuid]?.name || state.t.bgPage;
        busyMessage = state.t.processingOther.replace('{name}', processingName);
    }

    // 4. 重組模板 (乾淨俐落)
    const template = `
        <div id="ai-sidebar-container" class="sidebar-item" style="margin: 8px; border: 1px solid var(--ls-border-color); background: var(--ls-primary-background-color); border-radius: 8px; overflow: hidden; display: flex; flex-direction: column;">
            ${buildHeader(state.isCollapsed, state.t.aiBtnText)}
            <div style="display: ${state.isCollapsed ? 'none' : 'flex'}; flex-direction: column; height: 500px;">
                <!-- 💡 這裡補上 state.t.welcome 作為第四個引數 -->
                ${buildChatHistory(currentData.msgs, state.isBusy, busyMessage, state.t.welcome)}
                ${buildInputArea(state.t.placeholder, state.isBusy)}
            </div>
        </div>
    `;

    // 5. 輸出至 UI
    logseq.provideUI({ key: 'ai-sidebar', path: '#right-sidebar .sidebar-item-list', template });

    // 6. 綁定事件
    setupEventListeners();
}

// 將對話框的 DOM 事件綁定獨立出一個負責的函數
function setupEventListeners() {
    setTimeout(() => {
        const textarea = parent.document.getElementById('ai-sidebar-textarea') as HTMLTextAreaElement;
        if (textarea) {
            textarea.value = state.tempInput;
            textarea.oninput = (e: any) => { state.tempInput = e.target.value; };
            textarea.onkeydown = (e) => {
                if (["ArrowUp", "ArrowDown", "Enter"].includes(e.key)) e.stopPropagation();
                if (e.key === "Enter" && !e.shiftKey && !state.isBusy) {
                    e.preventDefault();
                    e.stopPropagation();
                    agent.sendMsg();
                }
            };
        }
        const hist = parent.document.getElementById('ai-chat-history-scroll');
        if (hist) hist.scrollTop = hist.scrollHeight;
    }, 50);
}