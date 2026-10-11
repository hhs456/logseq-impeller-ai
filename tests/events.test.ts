// tests/events.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installLogseqMock, LogseqMock } from './helpers/logseq-mock';
import { state, I18N } from '../src/config';
import { renderUI } from '../src/ui';
import { installEventDelegation, uninstallEventDelegation } from '../src/ui/events';
import { actions } from '../src/actions';
import { agent } from '../src/agent';
import { panel } from '../src/panel';
import { MemoryManager } from '../src/memory';

const tick = (ms: number) => new Promise(r => setTimeout(r, ms));
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

let mock: LogseqMock;

function setupChat(msgs: any[] = []) {
    mock = installLogseqMock();
    state.t = I18N['en'];
    state.isVisible = true;
    state.isBusy = false;
    state.isCollapsed = false;
    state.isMemoryCollapsed = false;
    state.currentPageUuid = 'page-1';
    state.currentGraphPath = 'D:/graphs/test-graph';
    state.chatStore = { 'page-1': { name: 'Page 1', msgs } };
    state.tempInput = '';
    state.processingPageUuid = null;
}

async function mount() {
    installEventDelegation();
    renderUI();
    await tick(220);
}

beforeEach(() => {
    uninstallEventDelegation();
});

afterEach(() => {
    uninstallEventDelegation();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('P2b: 委派管線', () => {
    it('DOM 延遲 2 秒掛載，點擊 sendMsg 仍觸發（驗收 #3）', async () => {
        vi.useFakeTimers();
        setupChat();
        mock.provideUI = vi.fn((opts: any) => {
            setTimeout(() => {
                const t = document.querySelector('#right-sidebar .sidebar-item-list');
                if (t) t.innerHTML = opts.template;
            }, 2000);
        });
        installEventDelegation();
        renderUI();
        const sendSpy = vi.spyOn(agent, 'sendMsg').mockResolvedValue(undefined);

        await vi.advanceTimersByTimeAsync(2100);
        const btn = parent.document.querySelector('[data-ai-act="sendMsg"]') as HTMLElement;
        expect(btn).not.toBeNull();
        click(btn);
        expect(sendSpy).toHaveBeenCalledTimes(1);
    });

    it('bubble 內注入 data-ai-act="deleteMsg" 點擊 → panel.deleteMsg 呼叫次數為 0（驗收 #5 第二層）', async () => {
        setupChat([{ role: 'assistant', content: 'hello', timestamp: 1 }]);
        await mount();
        const delSpy = vi.spyOn(panel, 'deleteMsg').mockResolvedValue(undefined);
        const bubble = parent.document.querySelector('.ai-bubble-content')!;
        bubble.innerHTML += '<span id="evil" data-ai-act="deleteMsg" data-index="0">x</span>';
        click(parent.document.getElementById('evil')!);
        expect(delSpy).not.toHaveBeenCalled();
    });

    it('ACTIONS 之外的 data-ai-act="evil" → 無任何呼叫', async () => {
        setupChat();
        await mount();
        const delSpy = vi.spyOn(panel, 'deleteMsg').mockResolvedValue(undefined);
        const inputWrapper = parent.document.getElementById('ai-sidebar-input-wrapper')!;
        inputWrapper.innerHTML += '<span id="evil2" data-ai-act="evil" data-index="0">x</span>';
        click(parent.document.getElementById('evil2')!);
        expect(delSpy).not.toHaveBeenCalled();
        expect(mock.UI.showMsg).not.toHaveBeenCalled();
    });

    it('renderUI 連續呼叫 N 次，document 監聽數不增加（只應有安裝時的 3 次）', async () => {
        setupChat();
        const doc = parent.document as any;
        const orig = doc.addEventListener.bind(parent.document);
        let count = 0;
        const types: string[] = [];
        doc.addEventListener = (type: string, fn: any, opts?: any) => {
            count++;
            types.push(`${type}:${opts === true ? 'capture' : String(opts)}`);
            return orig(type, fn, opts);
        };
        try {
            installEventDelegation();
            renderUI();
            renderUI();
            renderUI();
            renderUI();
            expect(count).toBe(3);
            expect(types).toEqual(['click:capture', 'keydown:capture', 'input:capture']);
        } finally {
            doc.addEventListener = orig;
        }
    });

    it('input 事件更新 state.tempInput', async () => {
        setupChat();
        await mount();
        const ta = parent.document.getElementById('ai-sidebar-textarea') as HTMLTextAreaElement;
        ta.value = 'draft text';
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        expect(state.tempInput).toBe('draft text');
    });
});

describe('P2b: 鍵盤路徑（IME / Enter / Esc）', () => {
    it('composing Enter 不發送；一般 Enter 發送；Shift+Enter 不發送', async () => {
        setupChat();
        await mount();
        const sendSpy = vi.spyOn(agent, 'sendMsg').mockResolvedValue(undefined);
        const ta = parent.document.getElementById('ai-sidebar-textarea') as HTMLTextAreaElement;

        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
        expect(sendSpy).not.toHaveBeenCalled();
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }));
        expect(sendSpy).not.toHaveBeenCalled();
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        expect(sendSpy).toHaveBeenCalledTimes(1);
    });

    it('Escape 於 busy 時呼叫 stopTask', async () => {
        setupChat();
        state.isBusy = true;
        await mount();
        const stopSpy = vi.spyOn(agent, 'stopTask');
        const ta = parent.document.getElementById('ai-sidebar-textarea') as HTMLTextAreaElement;
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(stopSpy).toHaveBeenCalledTimes(1);
    });

    it('ArrowUp/Enter 被 stopPropagation；一般字鍵照常冒泡', async () => {
        setupChat();
        await mount();
        const seen: string[] = [];
        const docListener = (e: Event) => seen.push((e as KeyboardEvent).key);
        parent.document.addEventListener('keydown', docListener);
        const ta = parent.document.getElementById('ai-sidebar-textarea') as HTMLTextAreaElement;
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
        parent.document.removeEventListener('keydown', docListener);
        expect(seen).toEqual(['a']);
    });
});

describe('P2b: bubble 區路由（D2）', () => {
    it('Copy 鈕取得 code textContent 逐字原文（驗收 #6）', async () => {
        const src = 'local x = t[[1]]\nprint(x)';
        setupChat([{ role: 'assistant', content: '```lua\n' + src + '\n```', timestamp: 1 }]);
        await mount();
        const copySpy = vi.spyOn(actions, 'copyCode').mockResolvedValue(undefined);
        click(parent.document.querySelector('.ai-copy-code-btn')!);
        expect(copySpy).toHaveBeenCalledWith(src);
    });

    it('wiki-link 點擊 → openPage(頁名)', async () => {
        setupChat([{ role: 'assistant', content: '關於 [[Taiwan AI]] 的討論', timestamp: 1 }]);
        await mount();
        const openSpy = vi.spyOn(actions, 'openPage').mockResolvedValue(undefined);
        click(parent.document.querySelector('a.ai-chat-wiki-link')!);
        expect(openSpy).toHaveBeenCalledWith('Taiwan AI');
    });

    it('bubble 內 http 連結 → preventDefault + openExternalLink', async () => {
        setupChat([{ role: 'assistant', content: '[link](https://example.com)', timestamp: 1 }]);
        await mount();
        const link = parent.document.querySelector('.ai-bubble-content a[href]')!;
        const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
        link.dispatchEvent(ev);
        expect(ev.defaultPrevented).toBe(true);
        expect(mock.App.openExternalLink).toHaveBeenCalledWith('https://example.com');
    });

    it('bubble 內一般文字點擊不干預（不 preventDefault）', async () => {
        setupChat([{ role: 'assistant', content: 'plain text', timestamp: 1 }]);
        await mount();
        const p = parent.document.querySelector('.ai-bubble-content p')!;
        const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
        p.dispatchEvent(ev);
        expect(ev.defaultPrevented).toBe(false);
    });
});

describe('P2b: bubble 外受信模板路由', () => {
    it('memory chip 點擊 → openPage(頁名)', async () => {
        setupChat();
        localStorage.setItem(
            MemoryManager.getGraphPrefix() + 'page-9',
            JSON.stringify({ name: 'Old Page', msgs: [{ role: 'user', content: 'x' }] })
        );
        await mount();
        const openSpy = vi.spyOn(actions, 'openPage').mockResolvedValue(undefined);
        const chip = parent.document.querySelector('.ai-memory-page-link')!;
        expect(chip).not.toBeNull();
        click(chip);
        expect(openSpy).toHaveBeenCalledWith('Old Page');
    });

    it('header ↺ → resetSettings；✕ → hidePanel', async () => {
        setupChat();
        await mount();
        const hideSpy = vi.spyOn(panel, 'hidePanel');
        const resetSpy = vi.spyOn(actions, 'resetSettings').mockResolvedValue(undefined);
        const resetEl = parent.document.querySelector('[data-ai-act="resetSettings"]')!;
        const hideEl = parent.document.querySelector('[data-ai-act="hidePanel"]')!;
        click(resetEl);
        click(hideEl);
        expect(resetSpy).toHaveBeenCalledTimes(1);
        expect(hideSpy).toHaveBeenCalledTimes(1);
    });

    it('Send/Stop 切換只改 data-ai-act / 文字 / class（無 inline style 殘留）', async () => {
        setupChat();
        await mount();
        const btn = parent.document.getElementById('ai-sidebar-send') as HTMLButtonElement;
        expect(btn.getAttribute('data-ai-act')).toBe('sendMsg');
        expect(btn.className).toContain('ai-send-btn');

        state.isBusy = true;
        renderUI();
        expect(btn.getAttribute('data-ai-act')).toBe('stopTask');
        expect(btn.textContent).toBe('🛑 Stop');
        expect(btn.className).toContain('ai-stop-btn');
        expect(btn.style.background).toBe('');
    });
});
