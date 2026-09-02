// src/ui/components.ts
import { escapeHTML, renderMarkdown } from '../utils/markdown';
import { MemoryManager } from '../memory';
import { state } from '../config';

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
        <div style="display: flex; align-items: center; gap: 4px;">
            <a data-on-click="resetSettings" title="Reset settings to defaults" style="opacity: 0.4; padding: 4px; cursor: pointer; font-size: 11px;">↺</a>
            <a data-on-click="hidePanel" style="opacity: 0.5; padding: 4px; cursor: pointer;">✕</a>
        </div>
    </div>`;
}

/**
 * 💡 新增：建立固定在 Header 下方的長期對話記憶庫區塊 (支援水平卷軸與折疊)
 */
export function buildMemorySection(isMemoryCollapsed: boolean): string {
    const savedPages = MemoryManager.getAllSavedPages();
    if (savedPages.length === 0) return '';

    const titleText = state.t?.langName?.includes("Chinese") ? "🧠 歷史對話記憶庫" : "🧠 Chat Memories";
    const arrowIcon = isMemoryCollapsed ? '▶' : '▼';

    const linksHtml = savedPages.map(p => `
        <span class="ai-memory-page-link" 
              data-on-click="openPage" 
              data-page-name="${escapeHTML(p.name)}" 
              title="${escapeHTML(p.name)}"
              style="cursor: pointer; padding: 4px 10px; background: var(--ls-primary-background-color); border: 1px solid var(--ls-border-color); border-radius: 6px; font-size: 11px; white-space: nowrap; flex-shrink: 0; display: inline-flex; align-items: center; gap: 4px; color: var(--ls-primary-text-color); opacity: 0.8; transition: all 0.15s; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
            📄 ${escapeHTML(p.name)}
        </span>
    `).join('');

    return `
    <div class="ai-memory-section" style="background: var(--ls-tertiary-background-color); border-bottom: 1px solid var(--ls-border-color); width: 100%; box-sizing: border-box; display: flex; flex-direction: column; flex-shrink: 0;">
        
        <div data-on-click="toggleMemoryCollapse" style="padding: 8px 15px; display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; background: var(--ls-secondary-background-color); border-bottom: ${isMemoryCollapsed ? 'none' : '1px dashed var(--ls-border-color)'};">
            <span style="font-size: 9px; opacity: 0.4;">${arrowIcon}</span>
            <span style="font-size: 11px; font-weight: bold; opacity: 0.5; letter-spacing: 0.5px;">${titleText.toUpperCase()}</span>
            <span style="font-size: 10px; opacity: 0.4; background: var(--ls-primary-background-color); padding: 1px 6px; border-radius: 10px; font-weight: bold;">${savedPages.length}</span>
        </div>
        
        <div class="ai-memory-scrollbar-container" style="display: ${isMemoryCollapsed ? 'none' : 'flex'}; flex-direction: row; flex-wrap: nowrap; gap: 6px; overflow-x: auto; padding: 10px 15px; width: 100%; box-sizing: border-box; align-items: center;">
            ${linksHtml}
        </div>
        
    </div>
    `;
}

/**
 * 建立聊天對話歷史區塊 (還原為純對話內容，移除清單)
 */
export function buildChatHistory(messages: any[], isBusy: boolean, busyMessage: string, welcomeText: string): string {
    const messageElements = messages.length === 0
        ? `<div style="font-size: 14px; padding: 20px; opacity: 0.4; text-align: center; line-height: 1.6;">${welcomeText}</div>`
        : messages.map((msg, index) => {
            const roleStr = msg.role as string;
            if (roleStr === 'system') return '';

            const isUser = roleStr === 'user';
            const alignStyle = isUser ? 'align-self: flex-end; background: var(--ls-secondary-background-color);' : 'align-self: flex-start; background: var(--ls-tertiary-background-color);';
            const bubbleClass = isUser ? 'ai-bubble-user' : 'ai-bubble-assistant';

            // 💡 修正：時間顯示格式改為完整的「年月日 時:分」
            const timeStr = msg.timestamp
                ? new Date(msg.timestamp).toLocaleString([], {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                })
                : '';

            let innerContent = '';
            if (roleStr === 'tool') {
                innerContent = `<div style="font-size: 11px; font-family: monospace; opacity: 0.6;">🛠️ Tool Call Result:<br/>${escapeHTML(msg.content)}</div>`;
            } else {
                // 💡 乾淨俐落！直接交給優化後的 renderMarkdown，不在此處做二次加工
                innerContent = renderMarkdown(msg.content);
            }
            
            return `
            <div class="chat-bubble-container" style="display: flex; flex-direction: column; width: 100%; margin-bottom: 12px;">
                <div class="${bubbleClass}" style="max-width: 85%; padding: 10px 14px; border-radius: 12px; font-size: 14px; line-height: 1.5; ${alignStyle} box-shadow: 0 1px 2px rgba(0,0,0,0.05); position: relative;">
                    <div class="ai-bubble-content">${innerContent}</div>
                    ${timeStr ? `<span class="ai-chat-time">${timeStr}</span>` : ''}
                </div>
                
                ${!isUser && roleStr !== 'tool' ? `
                <div style="display: flex; gap: 10px; margin-left: 6px; margin-top: 4px; opacity: 0.5; font-size: 11px;">
                    <span class="ai-action-link" data-on-click="copyMsg" data-index="${index}" style="cursor:pointer;">📋 Copy</span>
                    <span class="ai-action-link" data-on-click="regenerateMsg" data-index="${index}" style="cursor:pointer;">🔄 Retry</span>
                </div>
                ` : ''}

                ${isUser ? `
                <div style="display: flex; justify-content: flex-end; margin-right: 6px; margin-top: 4px; opacity: 0.3; font-size: 11px;">
                    <span class="ai-action-link" data-on-click="deleteMsg" data-index="${index}" style="cursor:pointer;">🗑️ Delete</span>
                </div>
                ` : ''}
            </div>
            `;
        }).join('');

    const busyElement = isBusy
        ? `<div style="align-self: flex-start; max-width: 85%; background: var(--ls-tertiary-background-color); padding: 10px 14px; border-radius: 12px; font-size: 13px; opacity: 0.6; font-style: italic; margin-bottom: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">${busyMessage}</div>`
        : '';

    return `
    <div id="ai-sidebar-history" style="flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; background: var(--ls-primary-background-color); border-bottom: 1px solid var(--ls-border-color); box-sizing: border-box;">
        ${messageElements}
        ${busyElement}
    </div>`;
}

/**
 * 建立底部輸入區塊
 */
export function buildInputArea(placeholderText: string, isBusy: boolean): string {
    // 👑 核心優化：絕對不要用 disabled！改用 readonly 搭配 opacity，讓它永遠活在焦點樹中
    const disabledAttr = isBusy ? 'readonly' : '';
    const visualStyle = isBusy ? 'opacity: 0.5; cursor: not-allowed;' : 'opacity: 1; cursor: text;';
    
    const btnText = isBusy ? `🛑 Stop` : `➤ Send`;
    const btnActionStyle = isBusy
        ? `data-on-click="stopTask" style="flex: 0.8; background: var(--ls-error-background-color, #ff4d4f); border: 1px solid var(--ls-border-color); border-radius: 6px; color: white; cursor: pointer; font-weight: bold;"`
        : `data-on-click="sendMsg" style="flex: 0.8; background: var(--ls-quaternary-background-color); border: 1px solid var(--ls-border-color); border-radius: 6px; opacity: 0.9; cursor: pointer; font-weight: bold;"`;

    return `
    <div style="padding: 12px; background: var(--ls-secondary-background-color); border-top: 1px solid var(--ls-border-color);">
        <textarea id="ai-sidebar-textarea" rows="2" placeholder="${placeholderText}" 
            style="width: 100%; background: var(--ls-primary-background-color); color: var(--ls-primary-text-color); border: 1px solid var(--ls-border-color); border-radius: 6px; padding: 10px; font-size: 13px; resize: none; outline: none; margin-bottom: 8px; box-sizing: border-box; ${visualStyle}" 
            ${disabledAttr}></textarea>
        
        <div style="display: flex; gap: 6px;">
            <button data-on-click="clearChat" class="ai-btn-action" style="flex: 1; padding: 6px 2px; opacity: 0.7; border: 1px solid var(--ls-border-color); border-radius: 6px; cursor: pointer;">🧹 Clear</button>
            <button data-on-click="exportChat" class="ai-btn-action" style="flex: 1; padding: 6px 2px; opacity: 0.7; border: 1px solid var(--ls-border-color); border-radius: 6px; cursor: pointer;">📤 Export</button>
            <button ${btnActionStyle}>${btnText}</button>
        </div>
    </div>`;
}