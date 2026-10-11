// src/utils/highlight.ts
// highlight.js core + 顯式註冊 14 種語言（含 lua，驗收 #6 需要）。
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import markdown from 'highlight.js/lib/languages/markdown';
import yaml from 'highlight.js/lib/languages/yaml';
import sql from 'highlight.js/lib/languages/sql';
import rust from 'highlight.js/lib/languages/rust';
import go from 'highlight.js/lib/languages/go';
import cpp from 'highlight.js/lib/languages/cpp';
import lua from 'highlight.js/lib/languages/lua';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('css', css);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('go', go);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('lua', lua);

const MAX_HIGHLIGHT_CHARS = 20_000;

/**
 * 回傳高亮後的 HTML；無法高亮（未註冊／過長／例外）回傳 null，呼叫端退回 escapeHTML。
 */
export function highlightCode(text: string, lang: string | null | undefined): string | null {
    if (!lang) return null;
    if (text.length > MAX_HIGHLIGHT_CHARS) return null;
    const canonical = lang.toLowerCase();
    if (!hljs.getLanguage(canonical)) return null;
    try {
        return hljs.highlight(text, { language: canonical, ignoreIllegals: true }).value;
    } catch {
        return null;
    }
}
