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
        currentData.msgs.map((m) => `
                    <div style="align-self: ${m.role === 'user' ? 'flex-end' : 'flex-start'}; max-width: 85%;">
                        <div style="padding: 8px 12px; border-radius: 12px; font-size: 13px; line-height: 1.5; 
                            background: ${m.role === 'user' ? 'var(--ls-quaternary-background-color)' : 'var(--ls-secondary-background-color)'}; 
                            color: var(--ls-primary-text-color); border: 1px solid var(--ls-border-color);">
                            ${m.content.replace(/\n/g, '<br>')}
                        </div>
                    </div>`).join('')}
                ${isBusy ? `<div style="align-self: flex-start; max-width: 85%;"><div class="ai-pulse" style="padding: 8px 12px; font-size: 13px; opacity: 0.6; font-style: italic; color: var(--ls-active-primary-color); font-weight: 600;">${busyMessage}</div></div>` : ''}
            </div>
            <div style="padding: 12px; background: var(--ls-secondary-background-color); border-top: 1px solid var(--ls-border-color);">
                <textarea id="ai-sidebar-textarea" rows="2" placeholder="${state.t.placeholder}" style="width: 100%; background: var(--ls-primary-background-color); color: var(--ls-primary-text-color); border: 1px solid var(--ls-border-color); border-radius: 6px; padding: 10px; font-size: 13px; resize: none; outline: none; margin-bottom: 8px; box-sizing: border-box;" ${isBusy ? 'disabled' : ''}></textarea>
                <div style="display: flex; gap: 6px;">
                    <button data-on-click="clearChat" class="ai-btn-action" style="flex: 0.2; opacity: 0.7; border: 1px solid var(--ls-border-color); border-radius: 6px;" ${isBusy ? 'disabled' : ''}>${state.t.clearBtn}</button>
                    
                    <button data-on-click="applyToPage" class="ai-btn-action" style="flex: 0.6; font-weight: bold; opacity: 0.85; border: 1px solid var(--ls-border-color); border-radius: 6px;" ${isBusy ? 'disabled' : ''}>${state.t.applyBtn}</button>
                    
                    ${isBusy
        ? `<button data-on-click="stopTask" class="ai-btn-action ai-stop-btn" style="flex: 0.2; border-radius: 6px;">${state.t.stopBtn}</button>`
        : `<button data-on-click="sendMsg" class="ai-btn-action" style="flex: 0.2; background: var(--ls-quaternary-background-color); border: 1px solid var(--ls-border-color); border-radius: 6px; opacity: 0.9;">➤</button>`}
                </div>
            </div>
        </div>
    </div>
    `;
    logseq.provideUI({ key: 'ai-sidebar', path: '#right-sidebar .sidebar-item-list', template });
    setTimeout(() => {
        const textarea = parent.document.getElementById('ai-sidebar-textarea');
        if (textarea) {
            textarea.value = state.tempInput;
            textarea.oninput = (e) => { state.tempInput = e.target.value; };
            textarea.onkeydown = (e) => {
                if (e.key === "Enter" && !e.shiftKey && !isBusy) {
                    e.preventDefault();
                    e.stopPropagation();
                    actions.sendMsg();
                }
            };
        }
        const hist = parent.document.getElementById('ai-chat-history-scroll');
        if (hist)
            hist.scrollTop = hist.scrollHeight;
    }, 50);
}
