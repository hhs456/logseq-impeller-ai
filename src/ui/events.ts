// src/ui/events.ts
// 事件管線：單一委派監聽掛在 parent.document（capture 階段），與 DOM 掛載時機無關。
// 路由分兩區：bubble 內只認 .ai-chat-wiki-link / .ai-copy-code-btn / a[href]；
// bubble 外只認 data-ai-act allowlist（受信模板專用）。
import '@logseq/libs';
import { state } from '../config';
import { actions } from '../actions';
import { agent } from '../agent';
import { panel } from '../panel';
import { logger } from '../utils/logger';

type Handler = (e: Event, root: Element, target: Element) => void | Promise<void>;

const ACTIONS: Record<string, Handler> = {
    toggleCollapse: () => panel.toggleCollapse(),
    hidePanel: () => panel.hidePanel(),
    resetSettings: () => actions.resetSettings(),
    toggleMemoryCollapse: () => panel.toggleMemoryCollapse(),
    clearChat: () => panel.clearChat(),
    exportChat: () => panel.exportChat(),
    sendMsg: () => agent.sendMsg(),
    stopTask: () => agent.stopTask(),
    openPage: (_e, _root, target) => actions.openPage(target.getAttribute('data-ai-page') ?? ''),
    copyMsg: (_e, _root, target) => panel.copyMsg(parseInt(target.getAttribute('data-index') ?? '-1', 10)),
    regenerateMsg: (_e, _root, target) => agent.regenerateMsg(parseInt(target.getAttribute('data-index') ?? '-1', 10)),
    deleteMsg: (_e, _root, target) => panel.deleteMsg(parseInt(target.getAttribute('data-index') ?? '-1', 10)),
};

function rootOf(e: Event): Element | null {
    const target = e.target as Element | null;
    if (!target || typeof target.closest !== 'function') return null;
    return target.closest('#ai-sidebar-container');
}

function handleBubbleClick(e: Event, target: Element): void {
    const wiki = target.closest('a.ai-chat-wiki-link');
    if (wiki) {
        e.preventDefault();
        e.stopPropagation();
        void actions.openPage(wiki.getAttribute('data-ai-page') ?? '');
        return;
    }

    const copyBtn = target.closest('.ai-copy-code-btn');
    if (copyBtn) {
        e.preventDefault();
        e.stopPropagation();
        const codeEl = copyBtn.closest('.ai-code-block')?.querySelector('code');
        void actions.copyCode(codeEl?.textContent ?? '');
        return;
    }

    // 模型輸出的普通連結：http(s)/mailto 攔截為外部開啟（V7 保守路徑）
    const link = target.closest('a[href]');
    if (link) {
        const href = link.getAttribute('href') ?? '';
        if (/^(https?:|mailto:)/i.test(href)) {
            e.preventDefault();
            e.stopPropagation();
            const openExternal = (logseq.App as any).openExternalLink as ((url: string) => void) | undefined;
            if (typeof openExternal === 'function') {
                openExternal(href);
            } else {
                window.open(href, '_blank', 'noopener,noreferrer');
            }
        }
        return;
    }

    // bubble 內其他元素：不動作、不干預（保留文字選取）
}

function onClick(e: Event): void {
    const root = rootOf(e);
    if (!root) return;
    const target = e.target as Element;

    if (target.closest('.ai-bubble-content')) {
        handleBubbleClick(e, target);
        return;
    }

    const actEl = target.closest('[data-ai-act]');
    if (!actEl) return;
    const act = actEl.getAttribute('data-ai-act');
    if (!act || !(act in ACTIONS)) return;

    e.preventDefault();
    e.stopPropagation();
    Promise.resolve(ACTIONS[act](e, root, actEl)).catch(err => logger.error('[events] action failed:', act, err));
}

function onKeydown(e: KeyboardEvent): void {
    const root = rootOf(e);
    if (!root) return;
    if (e.isComposing || e.keyCode === 229) return;

    const target = e.target as Element;
    if (!target.closest('#ai-sidebar-textarea')) return;

    if (['ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) e.stopPropagation();

    if (e.key === 'Enter' && !e.shiftKey && !state.isBusy) {
        e.preventDefault();
        void agent.sendMsg();
    } else if (e.key === 'Escape' && state.isBusy) {
        e.preventDefault();
        agent.stopTask();
    }
}

function onInput(e: Event): void {
    const root = rootOf(e);
    if (!root) return;
    const target = e.target as Element;
    if (!target.closest('#ai-sidebar-textarea')) return;
    const value = (target as HTMLTextAreaElement).value;
    state.tempInput = value;
    if (state.currentPageUuid) state.drafts[state.currentPageUuid] = value;
}

let installed = false;

export function installEventDelegation(): void {
    if (installed) return;
    installed = true;
    parent.document.addEventListener('click', onClick, true);
    parent.document.addEventListener('keydown', onKeydown as EventListener, true);
    parent.document.addEventListener('input', onInput, true);
}

export function uninstallEventDelegation(): void {
    if (!installed) return;
    installed = false;
    parent.document.removeEventListener('click', onClick, true);
    parent.document.removeEventListener('keydown', onKeydown as EventListener, true);
    parent.document.removeEventListener('input', onInput, true);
}
