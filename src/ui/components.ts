// src/ui/components.ts
import { escapeHTML, renderMarkdown } from '../utils/markdown';

/**
 * 建立側邊欄頂部 Header
 */
export function buildHeader(isCollapsed: boolean, aiBtnText: string): string {
    return `
    <div class="header" data-on-click="toggleCollapse" style="padding: 10px 15px; background: var(--ls-secondary-background-color); border-bottom: 1px solid var(--ls-border-color); display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
        <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 10px; opacity: 0.5;">${isCollapsed ? '▶' : '▼'}</span>
            <span style="font-weight: 600; font-size: 0.85em; opacity: 0.8;">🤖 ${aiBtnText.toUpperCase()}</span>
        </div>
        <a data-on-click="hidePanel" style="opacity: 0.5; padding: 4px;">✕</a>
    </div>`;
}

/**
 * 建立聊天對話歷史區塊
 */
export function buildChatHistory(messages: any[], isBusy: boolean, busyMessage: string, welcomeText: string): string {
    // 渲染對話訊息
    const messageElements = messages.length === 0 
        ? `<div style="font-size: 14px; padding: 10px; opacity: 0.6;">${welcomeText}</div>`
        : messages.map((m: any, index: number) => {
            const isUser = m.role === 'user';
            const bgColor = isUser ? 'var(--ls-quaternary-background-color)' : 'var(--ls-secondary-background-color)';
            const contentHtml = isUser ? escapeHTML(m.content).replace(/\n/g, '<br>') : renderMarkdown(m.content);
            
            // 操作按鈕 (複製/刪除/重新生成)
            const copyBtn = `<button class="ai-copy-btn" style="opacity: 0.7; position: static;" data-on-click="copyMsg" data-index="${index}" title="複製">📋</button>`;
            const actionBtn = isUser
                ? `<button class="ai-copy-btn" style="opacity: 0.7; position: static; color: #e74c3c;" data-on-click="deleteMsg" data-index="${index}" title="刪除此筆及後續">⏹️</button>`
                : `<button class="ai-copy-btn" style="opacity: 0.7; position: static; color: #3498db;" data-on-click="regenerateMsg" data-index="${index}" title="重新生成">🔄</button>`;
            
            return `
            <div class="msg-wrapper" style="align-self: ${isUser ? 'flex-end' : 'flex-start'}; max-width: 85%; position: relative;">
                <div class="ai-bubble-content" style="padding: 8px 12px; padding-right: 54px; border-radius: 12px; 
                    background: ${bgColor}; 
                    border: 1px solid var(--ls-border-color);">
                    ${contentHtml}
                </div>
                <div style="position: absolute; top: 4px; right: 4px; display: flex; gap: 0px;">
                    ${copyBtn}${actionBtn}
                </div>
            </div>`;
        }).join('');

    // 處理中 (Thinking/Busy) 的動畫文字區塊
    const busyElement = isBusy 
        ? `<div style="align-self: flex-start; max-width: 85%;">
             <div class="ai-pulse" style="padding: 8px 12px; font-size: 13px; opacity: 0.6; font-style: italic; color: var(--ls-active-primary-color); font-weight: 600;">
                 ${busyMessage}
             </div>
           </div>` 
        : '';

    return `
    <div id="ai-chat-history-scroll" style="flex: 1; padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px;">
        ${messageElements}
        ${busyElement}
    </div>`;
}

/**
 * 建立底部輸入區塊與操作列
 */
export function buildInputArea(placeholderText: string, isBusy: boolean): string {
    const disabledAttr = isBusy ? 'disabled' : '';
    
    // 右下角主要操作按鈕 (停止或發送)
    const primaryActionButton = isBusy
        ? `<button data-on-click="stopTask" class="ai-btn-action ai-stop-btn" style="flex: 0.6; border-radius: 6px;">■</button>`
        : `<button data-on-click="sendMsg" class="ai-btn-action" style="flex: 0.6; background: var(--ls-quaternary-background-color); border: 1px solid var(--ls-border-color); border-radius: 6px; opacity: 0.9;">➤</button>`;

    return `
    <div style="padding: 12px; background: var(--ls-secondary-background-color); border-top: 1px solid var(--ls-border-color);">
        <textarea id="ai-sidebar-textarea" rows="2" placeholder="${placeholderText}" 
            style="width: 100%; background: var(--ls-primary-background-color); color: var(--ls-primary-text-color); border: 1px solid var(--ls-border-color); border-radius: 6px; padding: 10px; font-size: 13px; resize: none; outline: none; margin-bottom: 8px; box-sizing: border-box;" 
            ${disabledAttr}></textarea>
        
        <div style="display: flex; gap: 4px;">
            <button data-on-click="clearChat" class="ai-btn-action" style="flex: 1; padding: 6px 2px; opacity: 0.7; border: 1px solid var(--ls-border-color); border-radius: 6px;" ${disabledAttr}>🧹Clear</button>
            <button data-on-click="exportChat" class="ai-btn-action" style="flex: 1; padding: 6px 2px; opacity: 0.7; border: 1px solid var(--ls-border-color); border-radius: 6px;" ${disabledAttr}>📥Export</button>
            <button data-on-click="formatPage" class="ai-btn-action" style="flex: 1; padding: 6px 2px; font-weight: bold; opacity: 0.85; border: 1px solid var(--ls-border-color); border-radius: 6px;" ${disabledAttr}>✒️Format</button>
            ${primaryActionButton}
        </div>
    </div>`;
}