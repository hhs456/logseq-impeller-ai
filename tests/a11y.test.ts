// tests/a11y.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { installLogseqMock } from './helpers/logseq-mock';
import { state, I18N } from '../src/config';
import { renderUI } from '../src/ui';
import { installEventDelegation, uninstallEventDelegation } from '../src/ui/events';

const tick = (ms: number) => new Promise(r => setTimeout(r, ms));

async function mount() {
    installEventDelegation();
    renderUI();
    await tick(220);
}

beforeEach(() => {
    uninstallEventDelegation();
    const mock = installLogseqMock();
    mock.settings = { model: 'm', basePath: 'https://x/api/v1', apiKey: 'k', temperature: 0.7, maxIterations: 7 };
    state.t = I18N['en'];
    state.lang = 'en';
    state.isVisible = true;
    state.isBusy = false;
    state.isCollapsed = false;
    state.isMemoryCollapsed = false;
    state.currentPageUuid = 'page-1';
    state.currentGraphPath = 'D:/graphs/test-graph';
    state.chatStore = { 'page-1': { name: 'P1', msgs: [{ role: 'assistant', content: 'hi', timestamp: 1 }] } };
    state.tempInput = '';
    state.drafts = {};
    state.processingPageUuid = null;
    state.run = null;
});

describe('P5b: 語義與 ARIA（驗收 #9）', () => {
    it('header 折疊鈕為 button，帶 aria-expanded / aria-controls', async () => {
        await mount();
        const toggle = parent.document.querySelector('.ai-header-toggle') as HTMLButtonElement;
        expect(toggle.tagName).toBe('BUTTON');
        expect(toggle.getAttribute('type')).toBe('button');
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(toggle.getAttribute('aria-controls')).toBe('ai-sidebar-body-wrapper');
    });

    it('↺ / ✕ 具 aria-label 且為 button', async () => {
        await mount();
        const reset = parent.document.querySelector('[data-ai-act="resetSettings"]') as HTMLButtonElement;
        const close = parent.document.querySelector('[data-ai-act="hidePanel"]') as HTMLButtonElement;
        expect(reset.tagName).toBe('BUTTON');
        expect(reset.getAttribute('aria-label')).toBe(state.t.resetSettingsTip);
        expect(close.getAttribute('aria-label')).toBe(state.t.closePanelTip);
    });

    it('對話區 role=log 且 aria-live=off；status 區 role=status aria-live=polite', async () => {
        await mount();
        const history = parent.document.getElementById('ai-sidebar-history')!;
        expect(history.getAttribute('role')).toBe('log');
        expect(history.getAttribute('aria-live')).toBe('off');
        const status = parent.document.getElementById('ai-sidebar-status')!;
        expect(status.getAttribute('role')).toBe('status');
        expect(status.getAttribute('aria-live')).toBe('polite');
        expect(status.className).toContain('ai-visually-hidden');
    });

    it('訊息動作皆為 button[type=button]，無 opacity:0.3 殘留（改由 CSS 上色）', async () => {
        await mount();
        const copy = parent.document.querySelector('[data-ai-act="copyMsg"]') as HTMLButtonElement;
        expect(copy.tagName).toBe('BUTTON');
        expect(copy.getAttribute('type')).toBe('button');
        expect(copy.textContent).toBe(state.t.copy);
        expect(copy.getAttribute('style')).toBeNull();
    });

    it('氣泡使用語義 class（is-user / ai-bubble-assistant）', async () => {
        state.chatStore['page-1'].msgs = [
            { role: 'user', content: 'u', timestamp: 1 },
            { role: 'assistant', content: 'a', timestamp: 1 },
        ];
        await mount();
        expect(parent.document.querySelector('.chat-bubble-container.is-user .ai-bubble-user')).not.toBeNull();
        expect(parent.document.querySelector('.chat-bubble-container.is-assistant .ai-bubble-assistant')).not.toBeNull();
    });
});

describe('P5a: 收合以 class 驅動（驗收 #2）', () => {
    it('連續切換 3 次 is-collapsed，容器 class 與 aria-expanded 同步', async () => {
        await mount();
        const container = parent.document.getElementById('ai-sidebar-container')!;
        const seq = [true, false, true];
        for (const collapsed of seq) {
            state.isCollapsed = collapsed;
            renderUI();
            expect(container.classList.contains('is-collapsed')).toBe(collapsed);
            const toggle = parent.document.querySelector('.ai-header-toggle') as HTMLButtonElement;
            expect(toggle.getAttribute('aria-expanded')).toBe(String(!collapsed));
        }
    });
});
