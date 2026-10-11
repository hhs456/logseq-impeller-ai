// tests/markdown.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderMarkdown, clearMarkdownCache } from '../src/utils/markdown';

beforeEach(() => {
    clearMarkdownCache();
});

describe('P2a: sanitize（驗收 #5a–#5d）', () => {
    it('移除 button 標籤與 data-on-click', () => {
        const html = renderMarkdown('<button data-on-click="clearChat">x</button>');
        expect(html).not.toContain('button');
        expect(html).not.toContain('data-on-click');
    });

    it('移除 a 上的 data-on-click 與 data-page-name', () => {
        const html = renderMarkdown('<a data-on-click="openPage" data-page-name="X">t</a>');
        expect(html).not.toContain('data-on-click');
        expect(html).not.toContain('data-page-name');
    });

    it('N1 回歸：data-ai-act / data-index 被剝除（ALLOW_DATA_ATTR:false）', () => {
        const html = renderMarkdown('<span data-ai-act="deleteMsg" data-index="0">x</span>');
        expect(html).not.toContain('data-ai-act');
        expect(html).not.toContain('data-index');
    });

    it('非 wiki-link 元素上的 data-ai-page 被 hook 剝除', () => {
        const html = renderMarkdown('<span data-ai-page="X">x</span>');
        expect(html).not.toContain('data-ai-page');
    });

    it('javascript: href 被剝除', () => {
        const html = renderMarkdown('[bad](javascript:alert(1))');
        expect(html).not.toContain('javascript:');
    });

    it('a[target] 補 rel=noopener noreferrer', () => {
        const html = renderMarkdown('<a href="https://example.com" target="_blank">t</a>');
        expect(html).toContain('rel="noopener noreferrer"');
    });
});

describe('P2a: 程式碼區塊與 Copy 鈕（驗收 #6 前置）', () => {
    it('code 內文的 [[ ]] 不被 wiki-link 化；lua 高亮後 textContent 逐字等於原文（驗收 #6）', () => {
        const src = 'local x = t[[1]]';
        const html = renderMarkdown('```lua\n' + src + '\n```');
        expect(html).not.toContain('ai-chat-wiki-link');
        expect(html).toContain('hljs-');
        const holder = document.createElement('div');
        holder.innerHTML = html;
        const code = holder.querySelector('code');
        expect(code?.textContent).toBe(src);
    });

    it('opts.highlight=false 時不高亮（純跳脫，供串流路徑）', () => {
        const html = renderMarkdown('```lua\nlocal x = 1\n```', { highlight: false });
        expect(html).not.toContain('hljs-');
        expect(html).toContain('local x = 1');
    });

    it('未註冊語言（brainfuck）→ 純跳脫無拋出', () => {
        const html = renderMarkdown('```brainfuck\n+++[->+]<.\n```');
        expect(html).not.toContain('hljs-');
        const holder = document.createElement('div');
        holder.innerHTML = html;
        expect(holder.querySelector('code')?.textContent).toContain('+++[->+]<.');
    });

    it('Copy 鈕為 span 且無 data-code 屬性', () => {
        const html = renderMarkdown('```\nabc\n```');
        expect(html).toContain('ai-copy-code-btn');
        expect(html).not.toContain('data-code');
        expect(html).not.toContain('<button');
    });

    it('copy 鈕與 wiki-link 獲得 role/tabindex', () => {
        const html = renderMarkdown('```\nx\n```\n\n[[Page]]');
        expect(html).toContain('class="ai-copy-code-btn" role="button" tabindex="0"');
        expect(html).toMatch(/<a class="ai-chat-wiki-link"[^>]*role="button" tabindex="0"/);
    });
});

describe('P2a: wiki-link extension（D4）', () => {
    it('[[Page|別名]] → data-ai-page="Page"、顯示 [[別名]]', () => {
        const html = renderMarkdown('[[Page|別名]]');
        expect(html).toContain('data-ai-page="Page"');
        expect(html).toContain('[[別名]]');
        expect(html).toContain('ai-chat-wiki-link');
    });

    it('[[<img onerror=1>]] 被跳脫：不產生 img 元素，值僅作為屬性資料存在', () => {
        const html = renderMarkdown('[[<img onerror=1>]]');
        const holder = document.createElement('div');
        holder.innerHTML = html;
        expect(holder.querySelector('img')).toBeNull();
        expect(holder.querySelector('a')?.getAttribute('data-ai-page')).toBe('<img onerror=1>');
        expect(holder.querySelector('a')?.textContent).toBe('[[<img onerror=1>]]');
    });

    it('超過 200 字元的頁名被移除 data-ai-page', () => {
        const long = 'a'.repeat(201);
        const html = renderMarkdown(`[[${long}]]`);
        expect(html).not.toContain('data-ai-page');
    });
});

describe('P2a: GFM task list（N10）', () => {
    it('- [x] done → 無 input、有 ai-task-box', () => {
        const html = renderMarkdown('- [x] done\n- [ ] todo');
        expect(html).not.toContain('<input');
        expect(html).toContain('ai-task-box');
        expect(html).toContain('☑');
        expect(html).toContain('☐');
    });
});

describe('P2a: memoize（D10）', () => {
    it('同輸入兩次回傳相同字串', () => {
        const a = renderMarkdown('**x**');
        const b = renderMarkdown('**x**');
        expect(a).toBe(b);
    });

    it('LRU 超額淘汰後仍正確重算', () => {
        const first = renderMarkdown('first');
        for (let i = 0; i < 250; i++) renderMarkdown(`chunk-${i}`);
        const again = renderMarkdown('first');
        expect(again).toBe(first);
    });
});
