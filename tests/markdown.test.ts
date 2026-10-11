// tests/markdown.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderMarkdown, clearMarkdownCache, getTxt } from '../src/utils/markdown';
import { blockText, pageDisplayName, slug, resolveBlockRefs } from '../src/graph/text';

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

// ─────────────────────────────────────────────
// Phase 1：blockText / getTxt / pageDisplayName / slug（§4.1 修 G/H、§4.7）
// ─────────────────────────────────────────────
describe('Phase 1: blockText 優先序（text > fullTitle > full-title > content > title > ""）', () => {
    it('六段鏈逐段退化', () => {
        expect(blockText({ text: 't', fullTitle: 'f', 'full-title': 'k', content: 'c', title: 'ti' })).toBe('t');
        expect(blockText({ fullTitle: 'f', 'full-title': 'k', content: 'c' })).toBe('f');
        expect(blockText({ 'full-title': 'k', content: 'c', title: 'ti' })).toBe('k');
        expect(blockText({ content: 'c', title: 'ti' })).toBe('c');
        expect(blockText({ title: 'ti' })).toBe('ti');
        expect(blockText({})).toBe('');
        expect(blockText(null)).toBe('');
        expect(blockText(undefined)).toBe('');
    });
});

describe('Phase 1: getTxt 經 blockText（修 G：缺值不产出 undefined 字串）', () => {
    it('file 實體（只有 content）與 v0.10.1 逐字等價', () => {
        const tree = [{ uuid: 'a', content: 'line1\nline2', children: [{ uuid: 'b', content: 'child' }] }];
        expect(getTxt(tree)).toBe('line1\nline2\nchild\n');
    });

    it('DB 實體取 fullTitle 優先於 content（[[uuid]] 噪音不入上下文）', () => {
        const tree = [{ uuid: 'a', fullTitle: 'Read [[Page]]', content: 'raw [[uuid]]' }];
        expect(getTxt(tree)).toBe('Read [[Page]]\n');
    });

    it('全缺值區塊回空字串而非 "undefined"', () => {
        const tree = [{ uuid: 'a', children: [{ uuid: 'b' }] }];
        expect(getTxt(tree)).toBe('\n\n');
        expect(getTxt(tree)).not.toContain('undefined');
    });
});

describe('Phase 1: pageDisplayName / slug', () => {
    it('pageDisplayName file：originalName || name（逐字現行）', () => {
        expect(pageDisplayName({ originalName: 'Apple', name: 'apple' }, 'file')).toBe('Apple');
        expect(pageDisplayName({ name: 'apple' }, 'file')).toBe('apple');
        expect(pageDisplayName({ originalName: '', name: 'apple' }, 'file')).toBe('apple');
        expect(pageDisplayName({}, 'file')).toBe('');
    });

    it('pageDisplayName db：title || originalName || name（修 H）', () => {
        expect(pageDisplayName({ title: 'Apple', name: 'apple' }, 'db')).toBe('Apple');
        expect(pageDisplayName({ originalName: 'Legacy', name: 'apple' }, 'db')).toBe('Legacy');
        expect(pageDisplayName({ name: 'apple' }, 'db')).toBe('apple');
        expect(pageDisplayName({}, 'db')).toBe('');
    });

    it('slug：小寫＋去首 #，兩種後端共用（§4.7）', () => {
        expect(slug('#Apple')).toBe('apple');
        expect(slug('Beta Gamma')).toBe('beta gamma');
        expect(slug('中文頁')).toBe('中文頁');
    });
});

// N14 修復的純函式面
describe('Phase 1: resolveBlockRefs 連結取代', () => {
    const U = '6acb9138-e682-45a5-a6bd-b646c2d34a52';
    const map = new Map([[U, 'ZZTest Apple']]);

    it('[[uuid]] → 可讀名', () => {
        expect(resolveBlockRefs(`引用 [[${U}]] 的區塊`, map)).toBe('引用 [[ZZTest Apple]] 的區塊');
    });

    it('別名形態 [[uuid|label]] 保留 label，只換 uuid', () => {
        expect(resolveBlockRefs(`[[${U}|我的標籤]]`, map)).toBe('[[ZZTest Apple|我的標籤]]');
    });

    it('((uuid)) 區塊引用保留原括號形式', () => {
        expect(resolveBlockRefs(`見 ((${U}))`, map)).toBe('見 ((ZZTest Apple))');
    });

    it('大小寫不敏感（map 鍵一律小寫）', () => {
        expect(resolveBlockRefs(`[[${U.toUpperCase()}]]`, map)).toBe('[[ZZTest Apple]]');
    });

    it('查不到的 uuid 原樣保留', () => {
        expect(resolveBlockRefs('[[99999999-8888-7777-6666-555544443333]]', map))
            .toBe('[[99999999-8888-7777-6666-555544443333]]');
    });

    it('空 map／空字串／非字串安全通過（不拋）', () => {
        expect(resolveBlockRefs(`[[${U}]]`, new Map())).toBe(`[[${U}]]`);
        expect(resolveBlockRefs('', map)).toBe('');
        expect(resolveBlockRefs(undefined as any, map)).toBe(undefined);
        expect(resolveBlockRefs(null as any, map)).toBe(null);
    });

    it('純文字不受影響', () => {
        expect(resolveBlockRefs('家長會談後，沒有連結的一行', map)).toBe('家長會談後，沒有連結的一行');
    });
});
