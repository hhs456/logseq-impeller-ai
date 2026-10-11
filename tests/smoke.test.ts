// tests/smoke.test.ts
import { describe, it, expect } from 'vitest';
import { renderMarkdown, escapeHTML } from '../src/utils/markdown';
import { installLogseqMock } from './helpers/logseq-mock';

describe('環境 smoke test（V3 / V9）', () => {
    it('V3: jsdom 下 window.parent === window，parent.document 可直接操作', () => {
        expect(window.parent).toBe(window);
        expect(parent.document).toBe(document);
        expect(typeof parent.document.getElementById).toBe('function');
    });

    it('V9: import @logseq/libs 已被 mock，globalThis.logseq 假物件可用', () => {
        const mock = installLogseqMock();
        expect(globalThis.logseq).toBe(mock as any);
        expect(typeof mock.provideUI).toBe('function');
        expect(typeof mock.UI.showMsg).toBe('function');
        mock.provideUI({ key: 't', path: '#right-sidebar .sidebar-item-list', template: '<i id="smoke-i"></i>' });
        expect(parent.document.getElementById('smoke-i')).not.toBeNull();
    });

    it('renderMarkdown 基本案例：粗體、程式碼、連結跳脫', () => {
        const html = renderMarkdown('**bold** and `code`');
        expect(html).toContain('<strong>bold</strong>');
        expect(html).toContain('<code>code</code>');
    });

    it('escapeHTML 基本案例', () => {
        expect(escapeHTML('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
    });
});
