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

/**
 * 將 Markdown 轉換為安全的 HTML，包含 Logseq 特殊語法與自訂程式碼區塊
 */
export function renderMarkdown(text: string): string {
    if (!text) return '';
    
    // 預處理 Logseq 的 <span class="logseq-page-ref" data-on-click="openPage" data-page-name="頁面連結">頁面連結</span> 語法
    const processedText = text.replace(/\[\[(.*?)\]\]/g, '<span class="logseq-page-ref">$1</span>');
    
    // 💡 1. 建立自訂的 Renderer     
    const renderer = new marked.Renderer();
    
    // 💡 注意這裡：原本的 function(code, language) 改成解構單一物件 { text, lang }
    renderer.code = function({ text, lang }) {
        // 如果沒有指定語言，預設為空字串
        const language = lang || ''; 
        // 將程式碼內容進行 URL 編碼，避免破壞 HTML 屬性結構
        const encodedCode = encodeURIComponent(text);
        
        return `
        <div style="position: relative; margin-bottom: 1em;">
            <!-- 程式碼專屬的複製按鈕 -->
            <button class="ai-copy-code-btn" 
                    style="position: absolute; top: 4px; right: 4px; padding: 2px 6px; font-size: 12px; opacity: 0.7; cursor: pointer; border-radius: 4px;" 
                    data-on-click="copyCode" 
                    data-code="${encodedCode}">📋 Copy</button>
            <pre><code class="language-${language}">${escapeHTML(text)}</code></pre>
        </div>
        `;
    };

    // 💡 2. 套用自訂 Renderer 將 Markdown 解析為 HTML 字串
    const rawHtml = marked.parse(processedText, {
        renderer: renderer,
        gfm: true,
        breaks: true
    }) as string;

    // 💡 3. 重點：必須在 DOMPurify 的白名單加入 data-on-click 和 data-code
    const safeHtml = DOMPurify.sanitize(rawHtml, {
        ALLOWED_TAGS: [
            'b', 'i', 'em', 'strong', 'a', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
            'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'table', 'thead', 'tbody', 
            'tr', 'th', 'td', 'br', 'span', 'div', 'input', 'button' // 👈 允許 'button'
        ], 
        ALLOWED_ATTR: [
            'href', 'target', 'class', 'style', 'type', 'checked', 
            'data-on-click', 'data-code' // 👈 允許自訂事件屬性
        ]
    });
    
    return safeHtml;
}