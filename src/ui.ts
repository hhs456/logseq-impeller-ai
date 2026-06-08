// src/ui.ts
import '@logseq/libs';
import { state } from './config';
import { actions } from './actions';

export function renderUI() {
    if (!state.isVisible) {
        logseq.provideUI({ key: 'ai-sidebar', template: '' });
        return;
    }

    const currentData = state.currentPageUuid && state.chatStore[state.currentPageUuid]
        ? state.chatStore[state.currentPageUuid]
        : { msgs: [] };
    const isBusy = state.isBusy;

    let busyMessage = state.t.thinking;
    if (isBusy && state.processingPageUuid && state.processingPageUuid !== state.currentPageUuid) {
        const processingName = state.chatStore[state.processingPageUuid]?.name || state.t.bgPage;
        busyMessage = state.t.processingOther.replace('{name}', processingName);
    }

const template = `
    <style>
        .ai-pulse { animation: ai-blink 1.4s infinite both; }
        @keyframes ai-blink { 0% { opacity: .2; } 50% { opacity: 1; } 100% { opacity: .2; } }
        
        .ai-btn-action { 
            cursor: pointer; 
            border: 1px solid var(--ls-border-color); 
            border-radius: 6px; 
            font-size: 11px; 
            background: var(--ls-primary-background-color); 
            color: var(--ls-primary-text-color);
            padding: 6px;
            transition: all 0.2s ease;
            outline: none;
            display: flex; align-items: center; justify-content: center;
        }
        
        .ai-btn-action:hover:not(:disabled) { 
            border-color: var(--ls-active-primary-color) !important;
            background: var(--ls-secondary-background-color) !important;
            box-shadow: 0 2px 6px rgba(0,0,0,0.15) !important;
            opacity: 1 !important; 
            transform: translateY(-1px); 
        }
        
        .ai-btn-action:disabled { 
            opacity: 0.3 !important; 
            cursor: not-allowed; 
            filter: grayscale(1);
        }

        .ai-stop-btn { background: #e74c3c !important; color: white !important; border: none !important; opacity: 0.9 !important; }
        .ai-stop-btn:hover { background: #c0392b !important; opacity: 1 !important; }

        /* 👇 新增的對話泡泡與複製按鈕樣式 👇 */
        .msg-wrapper { position: relative; }
        .ai-copy-btn {
            position: absolute;
            top: 4px;
            right: 4px;
            background: var(--ls-primary-background-color);
            border: 1px solid var(--ls-border-color);
            border-radius: 4px;
            cursor: pointer;
            opacity: 0; /* 預設隱藏 */
            font-size: 11px;
            padding: 2px 4px;
            transition: opacity 0.2s;
            color: var(--ls-primary-text-color);
        }
        /* 滑鼠移到泡泡上時顯示按鈕 */
        .msg-wrapper:hover .ai-copy-btn { opacity: 0.7; }
        /* 滑鼠移到按鈕本身時加深 */
        .ai-copy-btn:hover { opacity: 1 !important; background: var(--ls-secondary-background-color); }
    </style>
    <div id="ai-sidebar-container" class="sidebar-item" style="margin: 8px; border: 1px solid var(--ls-border-color); background: var(--ls-primary-background-color); border-radius: 8px; overflow: hidden; display: flex; flex-direction: column;">
        <div class="header" data-on-click="toggleCollapse" style="padding: 10px 15px; background: var(--ls-secondary-background-color); border-bottom: 1px solid var(--ls-border-color); display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 10px; opacity: 0.5;">${state.isCollapsed ? '▶' : '▼'}</span>
                <span style="font-weight: 600; font-size: 0.85em; opacity: 0.8;">🤖 ${state.t.aiBtnText.toUpperCase()}</span>
            </div>
            <a data-on-click="hidePortal" style="opacity: 0.5; padding: 4px;">✕</a>
        </div>
        <div style="display: ${state.isCollapsed ? 'none' : 'flex'}; flex-direction: column; height: 500px;">
    <div id="ai-chat-history-scroll" style="flex: 1; padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px;">
        ${currentData.msgs.length === 0 ? `<div style="font-size: 13px; padding: 10px; opacity: 0.6;">${state.t.welcome}</div>` : 
            currentData.msgs.map((m: any, index: number) => `
                <div class="msg-wrapper" style="align-self: ${m.role === 'user' ? 'flex-end' : 'flex-start'}; max-width: 85%; position: relative;">
                    <div style="padding: 8px 12px; padding-right: 54px; border-radius: 12px; font-size: 13px; line-height: 1.5; 
                        background: ${m.role === 'user' ? 'var(--ls-quaternary-background-color)' : 'var(--ls-secondary-background-color)'}; 
                        color: var(--ls-primary-text-color); border: 1px solid var(--ls-border-color);">
                        ${m.content.replace(/\n/g, '<br>')}
                    </div>
                    
                    <div style="position: absolute; top: 4px; right: 4px; display: flex; gap: 0px;">
                        <button class="ai-copy-btn" style="opacity: 0.7; position: static;" data-on-click="copyMsg" data-index="${index}" title="複製">📋</button>
                        ${m.role === 'user' 
                            ? `<button class="ai-copy-btn" style="opacity: 0.7; position: static; color: #e74c3c;" data-on-click="deleteMsg" data-index="${index}" title="刪除此筆及後續">⏹️</button>`
                            : `<button class="ai-copy-btn" style="opacity: 0.7; position: static; color: #3498db;" data-on-click="regenerateMsg" data-index="${index}" title="重新生成">🔄</button>`
                        }
                    </div>
                </div>`).join('')}
        ${isBusy ? `<div style="align-self: flex-start; max-width: 85%;"><div class="ai-pulse" style="padding: 8px 12px; font-size: 13px; opacity: 0.6; font-style: italic; color: var(--ls-active-primary-color); font-weight: 600;">${busyMessage}</div></div>` : ''}
    </div>
    <div style="padding: 12px; background: var(--ls-secondary-background-color); border-top: 1px solid var(--ls-border-color);">
        <textarea id="ai-sidebar-textarea" rows="2" placeholder="${state.t.placeholder}" style="width: 100%; background: var(--ls-primary-background-color); color: var(--ls-primary-text-color); border: 1px solid var(--ls-border-color); border-radius: 6px; padding: 10px; font-size: 13px; resize: none; outline: none; margin-bottom: 8px; box-sizing: border-box;" ${isBusy ? 'disabled' : ''}></textarea>
        
        <div style="display: flex; gap: 6px;">
            <button data-on-click="clearChat" class="ai-btn-action" style="flex: 0.35; opacity: 0.7; border: 1px solid var(--ls-border-color); border-radius: 6px;" ${isBusy ? 'disabled' : ''}>🧹Clear</button>
            <button data-on-click="formatPage" class="ai-btn-action" style="flex: 0.4; font-weight: bold; opacity: 0.85; border: 1px solid var(--ls-border-color); border-radius: 6px;" ${isBusy ? 'disabled' : ''}>✒️Format</button>
            ${isBusy 
                ? `<button data-on-click="stopTask" class="ai-btn-action ai-stop-btn" style="flex: 0.25; border-radius: 6px;">■</button>` 
                : `<button data-on-click="sendMsg" class="ai-btn-action" style="flex: 0.25; background: var(--ls-quaternary-background-color); border: 1px solid var(--ls-border-color); border-radius: 6px; opacity: 0.9;">➤</button>`
            }
        </div>
    </div>
</div>
    </div>
    `;

    logseq.provideUI({ key: 'ai-sidebar', path: '#right-sidebar .sidebar-item-list', template });

    setTimeout(() => {
        const textarea = parent.document.getElementById('ai-sidebar-textarea') as HTMLTextAreaElement;
        if (textarea) {
            textarea.value = state.tempInput;
            textarea.oninput = (e: any) => { state.tempInput = e.target.value; };
            textarea.onkeydown = (e) => {
                if (["ArrowUp", "ArrowDown", "Enter"].includes(e.key)) {
                    e.stopPropagation();
                }
                // 檢查是否為 Enter
                if (e.key === "Enter") {
                    if (e.shiftKey) {
                        // 💡 強制攔截：Shift+Enter
                        // 讓瀏覽器執行預設的換行行為，但確保它不要冒泡，不影響 Logseq 核心行為
                        // 這裡不需要 preventDefault，因為我們想要它換行
                        e.stopPropagation();
                        return;
                    } else {
                        // 💡 純 Enter：執行你的傳送邏輯
                        if (!isBusy) {
                            e.preventDefault();
                            e.stopPropagation(); // 徹底阻斷冒泡
                            actions.sendMsg();
                        }
                    }
                }
            };
        }
        const hist = parent.document.getElementById('ai-chat-history-scroll');
        if (hist) hist.scrollTop = hist.scrollHeight;
    }, 50);
}