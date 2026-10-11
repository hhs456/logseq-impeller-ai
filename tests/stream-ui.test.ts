// tests/stream-ui.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { installLogseqMock } from './helpers/logseq-mock';
import { state, I18N } from '../src/config';
import { renderUI, renderStreamDelta } from '../src/ui';
import { installEventDelegation, uninstallEventDelegation } from '../src/ui/events';

const tick = (ms: number) => new Promise(r => setTimeout(r, ms));

beforeEach(() => {
    uninstallEventDelegation();
    const mock = installLogseqMock();
    mock.settings = { model: 'm', basePath: 'https://x/api/v1', apiKey: 'k', temperature: 0.7, maxIterations: 7 };
    state.t = I18N['en'];
    state.isVisible = true;
    state.isBusy = false;
    state.isCollapsed = false;
    state.isMemoryCollapsed = false;
    state.currentPageUuid = 'page-1';
    state.currentGraphPath = 'D:/graphs/test-graph';
    state.chatStore = { 'page-1': { name: 'P1', msgs: [] } };
    state.tempInput = '';
    state.drafts = {};
    state.liveTrace = [];
    state.run = null;
    installEventDelegation();
    renderUI();
});

describe('P6a 串流 UI 熱路徑', () => {
    it('busy 時 renderStreamDelta 建立暫態氣泡、不高亮、不重建 history', async () => {
        state.isBusy = true;
        renderUI();
        renderStreamDelta('**hi** `x`');
        await tick(150);
        const bubble = parent.document.getElementById('ai-stream-bubble');
        expect(bubble).not.toBeNull();
        const content = bubble!.querySelector('.ai-bubble-content')!;
        expect(content.innerHTML).toContain('<strong>hi</strong>');
        expect(content.innerHTML).not.toContain('hljs-');
    });

    it('完成後（非 busy）遲到的回調不會重建暫態氣泡（stray-bubble 防護）', async () => {
        state.isBusy = true;
        renderUI();
        renderStreamDelta('partial');
        await tick(150);
        expect(parent.document.getElementById('ai-stream-bubble')).not.toBeNull();

        state.isBusy = false;
        renderUI(); // 重建 history，移除暫態氣泡
        expect(parent.document.getElementById('ai-stream-bubble')).toBeNull();

        renderStreamDelta('late'); // 排隊但被 busy 守衛攔下
        await tick(150);
        expect(parent.document.getElementById('ai-stream-bubble')).toBeNull();
    });

    it('問題2 回歸：空／純空白 delta 不建立氣泡（工具回合無前導文字時）', async () => {
        state.isBusy = true;
        renderUI();
        renderStreamDelta('');
        renderStreamDelta('   ');
        await tick(150);
        expect(parent.document.getElementById('ai-stream-bubble')).toBeNull();
    });

    it('問題2 回歸：空 delta 不應抹掉已顯示的文字', async () => {
        state.isBusy = true;
        renderUI();
        renderStreamDelta('已顯示的內容');
        await tick(150);
        renderStreamDelta('');
        await tick(150);
        const bubble = parent.document.getElementById('ai-stream-bubble');
        expect(bubble).not.toBeNull();
        expect(bubble!.textContent).toContain('已顯示的內容');
    });
});

describe('P6b 工具軌跡渲染', () => {
    it('持久化 trace 在 assistant 訊息下方以 details 呈現', async () => {
        state.chatStore['page-1'].msgs = [{
            role: 'assistant', content: 'done', timestamp: 1,
            trace: [{ id: 'c1', name: 'web_search', argsSummary: 'x', status: 'done', ms: 42 }],
        }];
        renderUI();
        await tick(20);
        const details = parent.document.querySelector('.ai-trace') as HTMLDetailsElement;
        expect(details).not.toBeNull();
        expect(details.textContent).toContain('web_search');
        expect(details.textContent).toContain('42ms');
    });

    it('busy 氣泡顯示 liveTrace', async () => {
        state.liveTrace = [{ id: 'c1', name: 'graph_query', argsSummary: 'q', status: 'running' }];
        state.isBusy = true;
        renderUI();
        await tick(20);
        const busy = parent.document.querySelector('.ai-busy .ai-trace');
        expect(busy).not.toBeNull();
        expect(busy!.textContent).toContain('graph_query');
    });
});
