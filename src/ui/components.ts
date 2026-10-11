// src/ui/components.ts
import { escapeHTML, renderMarkdown } from '../utils/markdown';
import { state } from '../config';
import type { ToolTraceEntry } from '../types';

function buildTraceDetails(trace: ToolTraceEntry[]): string {
    if (!trace || trace.length === 0) return '';
    const icon = (s: ToolTraceEntry['status']) => (s === 'done' ? '✅' : s === 'error' ? '⚠️' : '⏳');
    const rows = trace.map(t => {
        const ms = t.ms != null ? ` <span class="ai-trace-ms">${t.ms}ms</span>` : '';
        return `<li>${icon(t.status)} <code>${escapeHTML(t.name)}</code> <span class="ai-trace-args">${escapeHTML(t.argsSummary)}</span>${ms}</li>`;
    }).join('');
    return `<details class="ai-trace"><summary>${escapeHTML(state.t.toolTraceSummary)}</summary><ul>${rows}</ul></details>`;
}

/**
 * 側邊欄頂部 Header（折疊／重設／關閉皆為語義 button）
 */
export function buildHeader(isCollapsed: boolean, aiBtnText: string): string {
    const t = state.t;
    return `
    <div class="ai-header">
        <button type="button" class="ai-header-toggle" data-ai-act="toggleCollapse"
            aria-expanded="${!isCollapsed}" aria-controls="ai-sidebar-body-wrapper">
            <span class="ai-chevron" aria-hidden="true">${isCollapsed ? '▶' : '▼'}</span>
            <span class="ai-header-title">🤖 ${escapeHTML(aiBtnText)}</span>
        </button>
        <div class="ai-header-actions">
            <button type="button" class="ai-icon-btn" data-ai-act="resetSettings"
                aria-label="${escapeHTML(t.resetSettingsTip)}" title="${escapeHTML(t.resetSettingsTip)}">↺</button>
            <button type="button" class="ai-icon-btn" data-ai-act="hidePanel"
                aria-label="${escapeHTML(t.closePanelTip)}" title="${escapeHTML(t.closePanelTip)}">✕</button>
        </div>
    </div>`;
}

/**
 * 长期对话记忆库横向 chip 列（可折疊）
 */
export function buildMemorySection(isMemoryCollapsed: boolean, savedPages: { uuid: string; name: string }[]): string {
    if (savedPages.length === 0) return '';

    const titleText = state.t.memoriesTitle;
    const arrowIcon = isMemoryCollapsed ? '▶' : '▼';

    const linksHtml = savedPages.map(p => `
        <button type="button" class="ai-memory-page-link"
            data-ai-act="openPage" data-ai-page="${escapeHTML(p.name)}" title="${escapeHTML(p.name)}">
            📄 ${escapeHTML(p.name)}
        </button>
    `).join('');

    return `
    <div class="ai-memory-section${isMemoryCollapsed ? ' is-collapsed' : ''}">
        <button type="button" class="ai-memory-toggle" data-ai-act="toggleMemoryCollapse"
            aria-expanded="${!isMemoryCollapsed}" aria-controls="ai-memory-list">
            <span class="ai-chevron" aria-hidden="true">${arrowIcon}</span>
            <span class="ai-memory-title">${escapeHTML(titleText)}</span>
            <span class="ai-memory-count">${savedPages.length}</span>
        </button>
        <div id="ai-memory-list" class="ai-memory-scrollbar-container">
            ${linksHtml}
        </div>
    </div>`;
}

/**
 * 聊天对话历史区块（role=log、aria-live=off；语音提示由独立 status 区负责）
 */
export function buildChatHistory(messages: any[], isBusy: boolean, busyMessage: string, welcomeText: string): string {
    const t = state.t;
    const messageElements = messages.length === 0
        ? `<div class="ai-welcome">${escapeHTML(welcomeText)}</div>`
        : messages.map((msg, index) => {
            const roleStr = msg.role as string;
            if (roleStr === 'system') return '';

            const isUser = roleStr === 'user';
            const bubbleClass = isUser ? 'ai-bubble-user' : 'ai-bubble-assistant';
            const containerClass = isUser ? 'chat-bubble-container is-user' : 'chat-bubble-container is-assistant';

            const timeStr = msg.timestamp
                ? new Date(msg.timestamp).toLocaleString([], {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', hour12: false,
                })
                : '';

            const innerContent = renderMarkdown(msg.content);

            const actionsHtml = isUser
                ? `<div class="ai-action-row">
                     <button type="button" class="ai-action-link" data-ai-act="deleteMsg" data-index="${index}">${escapeHTML(t.deleteFromHere)}</button>
                   </div>`
                : `<div class="ai-action-row">
                     <button type="button" class="ai-action-link" data-ai-act="copyMsg" data-index="${index}">${escapeHTML(t.copy)}</button>
                     <button type="button" class="ai-action-link" data-ai-act="regenerateMsg" data-index="${index}">${escapeHTML(t.retry)}</button>
                   </div>`;

            return `
            <div class="${containerClass}">
                <div class="${bubbleClass}">
                    <div class="ai-bubble-content">${innerContent}</div>
                    ${timeStr ? `<span class="ai-chat-time">${timeStr}</span>` : ''}
                </div>
                ${actionsHtml}
                ${!isUser && msg.trace ? buildTraceDetails(msg.trace) : ''}
            </div>`;
        }).join('');

    const busyElement = isBusy
        ? `<div class="ai-busy">${escapeHTML(busyMessage)}${buildTraceDetails(state.liveTrace)}</div>`
        : '';

    return `
    <div id="ai-sidebar-history" class="ai-history" role="log" aria-live="off">
        ${messageElements}
        ${busyElement}
    </div>`;
}

/**
 * 底部输入区块（Send/Stop 切换由 ui.ts 更新 data-ai-act／文字／class）
 */
export function buildInputArea(placeholderText: string, isBusy: boolean, draft: string): string {
    const t = state.t;
    const readonlyAttr = isBusy ? 'readonly' : '';
    const btnText = isBusy ? t.stop : t.send;
    const btnAct = isBusy ? 'stopTask' : 'sendMsg';
    const btnClass = isBusy ? 'ai-btn-action ai-send-toggle ai-stop-btn' : 'ai-btn-action ai-send-toggle ai-send-btn';

    return `
    <div class="ai-input-area">
        <textarea id="ai-sidebar-textarea" class="ai-textarea" rows="2" placeholder="${escapeHTML(placeholderText)}" ${readonlyAttr}>${escapeHTML(draft)}</textarea>
        <div class="ai-input-row">
            <button type="button" data-ai-act="clearChat" class="ai-btn-action">${escapeHTML(t.clear)}</button>
            <button type="button" data-ai-act="exportChat" class="ai-btn-action">${escapeHTML(t.export)}</button>
            <button id="ai-sidebar-send" type="button" data-ai-act="${btnAct}" class="${btnClass}">${escapeHTML(btnText)}</button>
        </div>
    </div>`;
}
