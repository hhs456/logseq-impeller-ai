// tests/ui.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installLogseqMock } from './helpers/logseq-mock';
import { state, I18N } from '../src/config';
import { renderUI } from '../src/ui';

const tick = (ms: number) => new Promise(r => setTimeout(r, ms));

async function mountSidebar() {
    renderUI();
    // focusOnMount 以 100ms 間隔輪詢；等它跑完一轮
    await tick(220);
}

beforeEach(() => {
    installLogseqMock();
    state.t = I18N['en'];
    state.isVisible = true;
    state.isBusy = false;
    state.isCollapsed = false;
    state.isMemoryCollapsed = false;
    state.currentPageUuid = 'page-1';
    state.currentGraphPath = 'D:/graphs/test-graph';
    state.chatStore = { 'page-1': { name: 'Page 1', msgs: [] } };
    state.tempInput = '';
    state.processingPageUuid = null;
});

describe('P1b: 焦點與游標', () => {
    it('renderUI 不重置 textarea 游標位置（無 setSelectionRange）', async () => {
        await mountSidebar();
        const textarea = parent.document.getElementById('ai-sidebar-textarea') as HTMLTextAreaElement;
        state.tempInput = 'hello world';
        renderUI();
        textarea.selectionStart = 2;
        textarea.selectionEnd = 2;

        renderUI();
        expect(textarea.selectionStart).toBe(2);
        expect(textarea.value).toBe('hello world');
    });

    it('焦點在外部 contenteditable 時，renderUI 不搶走 activeElement（驗收 #12）', async () => {
        await mountSidebar();
        const holder = parent.document.createElement('div');
        holder.setAttribute('contenteditable', 'true');
        parent.document.body.appendChild(holder);
        holder.focus();
        expect(parent.document.activeElement).toBe(holder);

        renderUI();
        expect(parent.document.activeElement).toBe(holder);
    });

    it('busy→idle 轉換且焦點空閒時，焦點歸還 textarea', async () => {
        await mountSidebar();
        state.isBusy = true;
        renderUI();
        (parent.document.activeElement as HTMLElement)?.blur();
        expect(parent.document.activeElement).toBe(parent.document.body);

        state.isBusy = false;
        renderUI();
        await tick(80);
        expect(parent.document.activeElement?.id).toBe('ai-sidebar-textarea');
    });

    it('busy→idle 轉換但焦點在外部時，不搶焦點', async () => {
        await mountSidebar();
        const holder = parent.document.createElement('div');
        holder.setAttribute('contenteditable', 'true');
        parent.document.body.appendChild(holder);

        state.isBusy = true;
        renderUI();
        holder.focus();

        state.isBusy = false;
        renderUI();
        await tick(80);
        expect(parent.document.activeElement).toBe(holder);
    });

    it('Stage A 模板直接帶入 draft 初值', async () => {
        state.tempInput = 'hi <b>';
        await mountSidebar();
        const textarea = parent.document.getElementById('ai-sidebar-textarea') as HTMLTextAreaElement;
        expect(textarea.value).toBe('hi <b>');
    });
});

describe('問題1 回歸：側欄捲動不應影響容器高度', () => {
    const rect = (top: number, height: number) => ({
        top, bottom: top + height, left: 0, right: 0, width: 0, height, x: 0, y: top, toJSON: () => ({}),
    });

    async function mountWithScrollAncestor() {
        renderUI();
        await tick(220);
        const container = parent.document.getElementById('ai-sidebar-container') as HTMLElement;
        const ancestor = parent.document.createElement('div');
        ancestor.style.overflowY = 'auto';
        container.parentNode!.insertBefore(ancestor, container);
        ancestor.appendChild(container);
        Object.defineProperty(ancestor, 'clientHeight', { value: 600, configurable: true });
        (ancestor as any).getBoundingClientRect = () => rect(100, 600);
        return { container, ancestor };
    }

    function setScroll(ancestor: HTMLElement, container: HTMLElement, scrollTop: number, containerViewportTop: number) {
        Object.defineProperty(ancestor, 'scrollTop', { value: scrollTop, configurable: true });
        (container as any).getBoundingClientRect = () => rect(containerViewportTop, 450);
    }

    it('捲動前後測得的 inline height 必須相同（內容座標，非 viewport 座標）', async () => {
        const { container, ancestor } = await mountWithScrollAncestor();

        setScroll(ancestor, container, 0, 150);
        renderUI();
        const heightUnscrolled = container.style.height;
        expect(heightUnscrolled).toBe('542px');

        // 側欄捲動 200px：container 的 viewport top 上移至 -50，但內容座標不變
        setScroll(ancestor, container, 200, -50);
        renderUI();
        expect(container.style.height).toBe(heightUnscrolled);
    });

    it('收合時清除 inline height，交給 CSS 的 .is-collapsed', async () => {
        const { container, ancestor } = await mountWithScrollAncestor();
        setScroll(ancestor, container, 0, 150);
        renderUI();
        expect(container.style.height).not.toBe('');

        state.isCollapsed = true;
        renderUI();
        expect(container.style.height).toBe('');
        expect(container.classList.contains('is-collapsed')).toBe(true);
    });
});
