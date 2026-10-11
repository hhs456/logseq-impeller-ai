// src/utils/markdown.ts
import { Marked, type Tokens } from 'marked';
import DOMPurify from 'dompurify';
import { highlightCode } from './highlight';
import { blockText } from '../graph/text';

/**
 * 基本的 HTML 溢出字元跳脫處理
 */
export function escapeHTML(str: string): string {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function getTxt(tree: any[]): string {
    return tree.reduce(
        (acc: string, b: any) => acc + blockText(b) + '\n' + (b.children ? getTxt(b.children) : ''),
        ''
    );
}

const MAX_PAGE_NAME = 200;
const CACHE_MAX_ENTRIES = 200;

// ─────────────────────────────────────────────
// DOMPurify hook：於模組載入時註冊一次
// ─────────────────────────────────────────────
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as Element;
    if (typeof el.getAttribute !== 'function') return;
    const isWikiLink = el.tagName === 'A' && el.classList.contains('ai-chat-wiki-link');

    if (el.hasAttribute('data-ai-page')) {
        const value = el.getAttribute('data-ai-page') ?? '';
        if (!isWikiLink || value.length > MAX_PAGE_NAME) {
            el.removeAttribute('data-ai-page');
        }
    }
    if (el.tagName === 'A' && el.hasAttribute('target')) {
        el.setAttribute('rel', 'noopener noreferrer');
    }
    if (isWikiLink || el.classList.contains('ai-copy-code-btn')) {
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
    }
});

// ─────────────────────────────────────────────
// marked 實例（不使用全域 marked，避免跨模組污染）
// ─────────────────────────────────────────────
// marked 使用實例而非全域，避免跨模組污染
const markedInstance = new Marked({ gfm: true, breaks: true });

// parse 為同步，故此旗標在单次 renderMarkdownUncached 期間安全
let _wantHighlight = true;

markedInstance.use({
    extensions: [{
        name: 'wikilink',
        level: 'inline',
        start(src: string) {
            return src.indexOf('[[');
        },
        tokenizer(src: string): Tokens.Generic | undefined {
            const match = /^\[\[([^\[\]\n|]{1,200})(?:\|([^\[\]\n]{1,200}))?\]\]/.exec(src);
            if (!match) return undefined;
            return {
                type: 'wikilink',
                raw: match[0],
                page: match[1],
                label: match[2] ?? match[1],
            };
        },
        renderer(token: Tokens.Generic): string {
            const page = escapeHTML(String(token.page ?? ''));
            const label = escapeHTML(String(token.label ?? ''));
            return `<a class="ai-chat-wiki-link" data-ai-page="${page}">[[${label}]]</a>`;
        },
    }],
    renderer: {
        code({ text, lang, escaped }) {
            const language = escapeHTML(lang || '');
            let body: string;
            if (_wantHighlight && lang) {
                const highlighted = highlightCode(text, lang);
                body = highlighted !== null ? highlighted : escapeHTML(text);
            } else {
                body = escaped ? text : escapeHTML(text);
            }
            return `<div class="ai-code-block"><span class="ai-copy-code-btn">📋 Copy</span><pre><code class="language-${language}">${body}</code></pre></div>`;
        },
        checkbox({ checked }) {
            return `<span class="ai-task-box">${checked ? '☑' : '☐'}</span>`;
        },
    },
});

const SANITIZE_CONFIG = {
    ALLOW_DATA_ATTR: false,
    ALLOWED_TAGS: [
        'b', 'i', 'em', 'strong', 'a', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'table', 'thead', 'tbody',
        'tr', 'th', 'td', 'br', 'span', 'div',
    ],
    ALLOWED_ATTR: ['href', 'target', 'class', 'data-ai-page'],
};

function renderMarkdownUncached(text: string, highlight: boolean): string {
    _wantHighlight = highlight;
    let rawHtml: string;
    try {
        rawHtml = markedInstance.parse(text) as string;
    } finally {
        _wantHighlight = true;
    }
    return DOMPurify.sanitize(rawHtml, SANITIZE_CONFIG);
}

// ─────────────────────────────────────────────
// Memoize（D10）：以 (highlight, 原文) 為 key 的 LRU 快取
// ─────────────────────────────────────────────
const markdownCache = new Map<string, string>();

export function clearMarkdownCache(): void {
    markdownCache.clear();
}

export interface RenderOptions {
    highlight?: boolean;
}

/**
 * 將 Markdown 轉換為安全的 HTML。
 * 模型內容區不放任何 data-* 動作屬性；wiki-link 只保留 data-ai-page。
 * opts.highlight === false 時跳過語法高亮（串流熱路徑用，P6）。
 */
export function renderMarkdown(text: string, opts?: RenderOptions): string {
    if (!text) return '';
    const highlight = opts?.highlight !== false;
    const key = (highlight ? '1' : '0') + '\u0000' + text;

    const cached = markdownCache.get(key);
    if (cached !== undefined) {
        markdownCache.delete(key);
        markdownCache.set(key, cached);
        return cached;
    }

    const html = renderMarkdownUncached(text, highlight);

    if (markdownCache.size >= CACHE_MAX_ENTRIES) {
        const oldest = markdownCache.keys().next().value;
        if (oldest !== undefined) markdownCache.delete(oldest);
    }
    markdownCache.set(key, html);
    return html;
}
