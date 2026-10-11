// src/ui.ts
import '@logseq/libs';
import { state } from './config';
import { SIDEBAR_CSS } from './ui/styles';
import { buildHeader, buildMemorySection, buildChatHistory, buildInputArea } from './ui/components';
import { renderMarkdown } from './utils/markdown';
import { MemoryManager } from './memory';
import { logger } from './utils/logger';

let lastBusyState = false;
let lastMemVersion = -1;
let lastMemCollapsed: boolean | null = null;

function focusTextareaIfAppropriate() {
    const textarea = parent.document.getElementById('ai-sidebar-textarea') as HTMLTextAreaElement | null;
    if (!textarea) return;
    const active = parent.document.activeElement;
    const container = parent.document.getElementById('ai-sidebar-container');
    const focusIsFree = !active || active === parent.document.body || (container !== null && container.contains(active));
    const selection = parent.getSelection?.();
    const selectionCollapsed = !selection || selection.isCollapsed;
    if (focusIsFree && selectionCollapsed) {
        textarea.focus();
    }
}

// 初次掛載聚焦：有限輪詢（≤ 20 次 × 100ms），找到 textarea 就 focus 一次
function focusOnMount(attemptsLeft = 20) {
    const textarea = parent.document.getElementById('ai-sidebar-textarea') as HTMLTextAreaElement | null;
    if (textarea) {
        fitSidebarContainer();
        if (!state.isBusy) textarea.focus();
        return;
    }
    if (attemptsLeft <= 0) return;
    setTimeout(() => focusOnMount(attemptsLeft - 1), 100);
}

// V8 解決方案：不猜 --ai-sidebar-offset，直接測量容器到側欄可視區底部的真實可用高度。
// 關鍵：必須用「內容座標」而非 viewport 座標，否則側欄被捲動時測量值會漂移，
// 造成 re-render 時容器被撐高、操作區推出畫面（切頁回饋循環）。
const FIT_MIN_HEIGHT = 280;
const FIT_MARGIN = 8;
let fitListenerInstalled = false;

function findScrollAncestor(el: HTMLElement): HTMLElement | null {
    let n = el.parentElement;
    while (n && n !== parent.document.documentElement) {
        const cs = parent.getComputedStyle(n);
        if (/(auto|scroll)/.test(cs.overflowY)) return n;
        n = n.parentElement;
    }
    return null;
}

function fitSidebarContainer() {
    const el = parent.document.getElementById('ai-sidebar-container') as HTMLElement | null;
    if (!el) return;
    if (state.isCollapsed) {
        el.style.height = '';
        return;
    }
    let avail: number;
    const ancestor = findScrollAncestor(el);
    if (ancestor) {
        const aRect = ancestor.getBoundingClientRect();
        const eRect = el.getBoundingClientRect();
        const offsetInContent = eRect.top - aRect.top + ancestor.scrollTop;
        avail = ancestor.clientHeight - offsetInContent - FIT_MARGIN;
    } else {
        avail = parent.innerHeight - el.getBoundingClientRect().top - FIT_MARGIN;
    }
    el.style.height = Math.max(FIT_MIN_HEIGHT, Math.floor(avail)) + 'px';
}

function installFitListener() {
    if (fitListenerInstalled) return;
    fitListenerInstalled = true;
    parent.addEventListener('resize', () => scheduleRender());
}

function renderUIInner() {
    const justFinishedBusy = lastBusyState && !state.isBusy;
    lastBusyState = state.isBusy;

    if (!state.isVisible) {
        logseq.provideUI({ key: 'ai-sidebar', template: '' });
        return;
    }

    logseq.provideStyle({ key: 'ai-sidebar-styles', style: SIDEBAR_CSS });

    const currentData = state.currentPageUuid && state.chatStore[state.currentPageUuid]
        ? state.chatStore[state.currentPageUuid]
        : { msgs: [] };

    const savedPages = MemoryManager.getAllSavedPages();
    const memVersion = MemoryManager.getIndexVersion();

    let busyMessage = state.t.thinking;
    if (state.isBusy && state.processingPageUuid && state.processingPageUuid !== state.currentPageUuid) {
        const processingName = state.chatStore[state.processingPageUuid]?.name || state.t.bgPage;
        busyMessage = state.t.processingOther.replace('{name}', processingName);
    }

    const containerEl = parent.document.getElementById('ai-sidebar-container');

    if (!containerEl) {
        // --------------------------------------------------------
        // 🏗️ 階段 A：初次渲染（只有第一次打開才會執行）
        // --------------------------------------------------------
        const template = `
            <div id="ai-sidebar-container" class="ai-container${state.isCollapsed ? ' is-collapsed' : ''}">
                <div class="ai-shell">
                    <div id="ai-sidebar-header-wrapper">${buildHeader(state.isCollapsed, state.t.aiBtnText)}</div>
                    <div id="ai-sidebar-body-wrapper" class="ai-body">
                        <div id="ai-sidebar-memory-wrapper">${buildMemorySection(state.isMemoryCollapsed, savedPages)}</div>
                        <div id="ai-sidebar-history-wrapper" class="ai-history-wrapper">
                            ${buildChatHistory(currentData.msgs, state.isBusy, busyMessage, state.t.welcome)}
                        </div>
                        <div id="ai-sidebar-input-wrapper">${buildInputArea(state.t.placeholder, state.isBusy, state.tempInput)}</div>
                    </div>
                </div>
                <div id="ai-sidebar-status" class="ai-visually-hidden" role="status" aria-live="polite"></div>
            </div>
        `;

        logseq.provideUI({ key: 'ai-sidebar', path: '#right-sidebar .sidebar-item-list', template });
        lastMemVersion = memVersion;
        lastMemCollapsed = state.isMemoryCollapsed;
        installFitListener();
        fitSidebarContainer();
        focusOnMount();

    } else {
        // --------------------------------------------------------
        // 🛠️ 階段 B：局部差分更新（無閃爍、不掉焦點）
        // --------------------------------------------------------

        containerEl.classList.toggle('is-collapsed', state.isCollapsed);
        fitSidebarContainer();

        // 1. 更新 Header 與 Memory
        const headerWrapper = parent.document.getElementById('ai-sidebar-header-wrapper');
        if (headerWrapper) headerWrapper.innerHTML = buildHeader(state.isCollapsed, state.t.aiBtnText);

        // P4：run 進行中且索引未變 → 跳過 chip 列重寫，避免 hover／捲動位置被重置
        const memoryWrapper = parent.document.getElementById('ai-sidebar-memory-wrapper');
        const skipMemory = state.run !== null && memVersion === lastMemVersion && state.isMemoryCollapsed === lastMemCollapsed;
        if (memoryWrapper && !skipMemory) {
            memoryWrapper.innerHTML = buildMemorySection(state.isMemoryCollapsed, savedPages);
        }
        lastMemVersion = memVersion;
        lastMemCollapsed = state.isMemoryCollapsed;

        // 2. 核心滾動防禦：先記錄現在的位置
        const historyElBefore = parent.document.getElementById('ai-sidebar-history');
        let shouldScrollToBottom = true;
        let savedScrollTop = 0;
        if (historyElBefore) {
            const threshold = 50;
            shouldScrollToBottom = (historyElBefore.scrollHeight - historyElBefore.scrollTop - historyElBefore.clientHeight) <= threshold;
            savedScrollTop = historyElBefore.scrollTop;
        }

        // 3. 瞬間抽換對話內容
        const historyWrapper = parent.document.getElementById('ai-sidebar-history-wrapper');
        if (historyWrapper) {
            historyWrapper.innerHTML = buildChatHistory(currentData.msgs, state.isBusy, busyMessage, state.t.welcome);

            const historyElAfter = parent.document.getElementById('ai-sidebar-history');
            if (historyElAfter) {
                if (shouldScrollToBottom) {
                    historyElAfter.scrollTop = historyElAfter.scrollHeight;
                } else {
                    historyElAfter.scrollTop = savedScrollTop;
                }
            }
        }

        // 4. 🔒 終極焦點防護：只切換 readonly，不搶焦點
        const textarea = parent.document.getElementById('ai-sidebar-textarea') as HTMLTextAreaElement;
        if (textarea) {
            textarea.readOnly = state.isBusy;
            textarea.style.opacity = state.isBusy ? '0.5' : '1';
            textarea.style.cursor = state.isBusy ? 'not-allowed' : 'text';

            if (textarea.value !== state.tempInput) {
                textarea.value = state.tempInput;
            }
        }

        // busy→idle 轉換時，只在焦點空閒時歸還輸入框
        if (justFinishedBusy) {
            setTimeout(focusTextareaIfAppropriate, 50);
        }

        // 5. 動態切換 Send/Stop：只改 data-ai-act、文字與 class
        const sendBtn = parent.document.getElementById('ai-sidebar-send') as HTMLButtonElement;
        if (sendBtn) {
            sendBtn.setAttribute('data-ai-act', state.isBusy ? 'stopTask' : 'sendMsg');
            sendBtn.textContent = state.isBusy ? state.t.stop : state.t.send;
            sendBtn.className = state.isBusy
                ? 'ai-btn-action ai-send-toggle ai-stop-btn'
                : 'ai-btn-action ai-send-toggle ai-send-btn';
        }
    }
}

// 3b：renderUI 外層 try/catch，錯誤只記錄不拋出，避免單一渲染失敗拖垮整個外掛
export function renderUI() {
    try {
        renderUIInner();
    } catch (err) {
        logger.error('[UI] renderUI 失敗:', err);
    }
}

// 3b：rAF 尾端節流——同一幀內多次請求只執行最後一次
let renderScheduled = false;
export function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    const raf = (parent as any).requestAnimationFrame ?? requestAnimationFrame;
    raf.call(parent, () => {
        renderScheduled = false;
        renderUI();
    });
}

// D6：視覺隱藏 status 區，僅在 4 個節點更新（開始思考／完成／中止／錯誤）
// 不對氣泡區套用 aria-live，避免串流逐字朗讀
export function setSidebarStatus(text: string) {
    const el = parent.document.getElementById('ai-sidebar-status');
    if (el) el.textContent = text;
}

// ─────────────────────────────────────────────
// P6a：串流熱路徑。只更新暫態氣泡，不重建 history／memory
// ─────────────────────────────────────────────
export function scrollToBottomIfPinned() {
    const h = parent.document.getElementById('ai-sidebar-history');
    if (!h) return;
    const threshold = 50;
    if ((h.scrollHeight - h.scrollTop - h.clientHeight) <= threshold) {
        h.scrollTop = h.scrollHeight;
    }
}

const STREAM_PAINT_MIN_INTERVAL_MS = 80;
let streamRafPending = false;
let streamLastPaint = 0;
let streamPendingText: string | null = null;

function ensureStreamBubble(): HTMLElement | null {
    const history = parent.document.getElementById('ai-sidebar-history');
    if (!history) return null;
    let el = parent.document.getElementById('ai-stream-bubble');
    if (!el) {
        el = parent.document.createElement('div');
        el.id = 'ai-stream-bubble';
        el.className = 'chat-bubble-container is-assistant';
        el.innerHTML = '<div class="ai-bubble-assistant"><div class="ai-bubble-content"></div></div>';
        const busy = history.querySelector('.ai-busy');
        if (busy) history.insertBefore(el, busy);
        else history.appendChild(el);
    }
    return el;
}

function paintStreamBubble() {
    streamRafPending = false;
    // 完成後可能仍有排程中的回調：僅在 busy 時繪製，避免殘留暫態氣泡
    if (!state.isBusy || !streamPendingText || !streamPendingText.trim()) return;
    streamLastPaint = performance.now();
    const el = ensureStreamBubble();
    if (!el) return;
    const content = el.querySelector('.ai-bubble-content');
    if (content) content.innerHTML = renderMarkdown(streamPendingText, { highlight: false });
    scrollToBottomIfPinned();
}

export function renderStreamDelta(text: string) {
    // 空／純空白 delta 不建氣泡（工具回合常見：模型先呼叫工具、尚無文字）
    if (!text || !text.trim()) return;
    streamPendingText = text;
    if (streamRafPending) return;
    streamRafPending = true;
    const raf = (parent as any).requestAnimationFrame ?? requestAnimationFrame;
    const elapsed = performance.now() - streamLastPaint;
    const delay = Math.max(0, STREAM_PAINT_MIN_INTERVAL_MS - elapsed);
    setTimeout(() => raf.call(parent, paintStreamBubble), delay);
}
