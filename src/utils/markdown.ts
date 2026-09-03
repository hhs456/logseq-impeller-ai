// src/utils/markdown.ts
import { marked } from 'marked';
import DOMPurify from 'dompurify';

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
        (acc: string, b: any) => acc + (b.content ?? '') + '\n' + (b.children ? getTxt(b.children) : ''),
        ''
    );
}

/**
 * 將 Markdown 轉換為安全的 HTML，包含 Logseq 特殊語法與自訂程式碼區塊
 */
export function renderMarkdown(text: string): string {
    if (!text) return '';
    
    // 💡 核心修正：直接在預處理階段，將 [[頁面]] 一步到位轉成符合你新架構的通用安全連結
    const processedText = text.replace(
        /\[\[(.*?)\]\]/g,
        (_, pageName) => {
            const safe = escapeHTML(pageName);
            return `<a class="ai-chat-wiki-link" data-on-click="openPage" data-page-name="${safe}">[[${safe}]]</a>`;
        }
    );
    
    // 1. 建立自訂的 Renderer     
    const renderer = new marked.Renderer();
    
    // 注意這裡：原本的 function(code, language) 改成解構單一物件 { text, lang }
    renderer.code = function({ text, lang }) {
        // 如果沒有指定語言，預設為空字串
        const language = escapeHTML(lang || '');  
        // 將程式碼內容進行 URL 編碼，避免破壞 HTML 屬性結構
        const encodedCode = encodeURIComponent(text); 
        
        return `
        <div class="ai-code-block">
            <button class="ai-copy-code-btn"
                    data-on-click="copyCode"
                    data-code="${encodedCode}">📋 Copy</button>
            <pre><code class="language-${language}">${escapeHTML(text)}</code></pre>
        </div>
        `; 
    };

    // 2. 套用自訂 Renderer 將 Markdown 解析為 HTML 字串
    const rawHtml = marked.parse(processedText, { 
        renderer: renderer, 
        gfm: true, 
        breaks: true 
    }) as string; 

    // 3. 重點：除了 data-on-click 和 data-code，必須額外在白名單加入 'data-page-name' 屬性
    const safeHtml = DOMPurify.sanitize(rawHtml, { 
        ALLOWED_TAGS: [ 
            'b', 'i', 'em', 'strong', 'a', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',  
            'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'table', 'thead', 'tbody',  
            'tr', 'th', 'td', 'br', 'span', 'div', 'input', 'button' 
        ], 
        ALLOWED_ATTR: [ 
            'href', 'target', 'class', 'type', 'checked',  
            'data-on-click', 'data-code', 'data-page-name' 
        ]
    });
    
    return safeHtml; 
}