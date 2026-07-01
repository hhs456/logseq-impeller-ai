// src/ui/styles.ts

export const SIDEBAR_CSS = `
    /* 允許游標反白選擇 */
    #right-sidebar #ai-sidebar-container .ai-bubble-content {
        font-size: 14px !important;
        line-height: 1.5 !important;
        color: var(--ls-primary-text-color);
        word-wrap: break-word;
        -webkit-user-select: text !important;
        user-select: text !important;
        cursor: text; 
    }

    /* 🌟 1. 標題排版修正 */
    #right-sidebar #ai-sidebar-container .ai-bubble-content h1 { font-size: 1.6em; font-weight: bold; margin: 0.6em 0; border-bottom: 1px solid var(--ls-border-color); padding-bottom: 0.3em; }
    #right-sidebar #ai-sidebar-container .ai-bubble-content h2 { font-size: 1.4em; font-weight: bold; margin: 0.5em 0; }
    #right-sidebar #ai-sidebar-container .ai-bubble-content h3 { font-size: 1.25em; font-weight: bold; margin: 0.5em 0; }
    #right-sidebar #ai-sidebar-container .ai-bubble-content h4,
    #right-sidebar #ai-sidebar-container .ai-bubble-content h5,
    #right-sidebar #ai-sidebar-container .ai-bubble-content h6 { font-size: 1.1em; font-weight: bold; margin: 0.5em 0; }
    
    /* 🌟 2. 表格排版修正 (加回邊框與底色) */
    #right-sidebar #ai-sidebar-container .ai-bubble-content table { 
        width: 100%; 
        border-collapse: collapse; 
        margin: 8px 0; 
        font-size: 13px !important;
    }
    #right-sidebar #ai-sidebar-container .ai-bubble-content th, 
    #right-sidebar #ai-sidebar-container .ai-bubble-content td { 
        border: 1px solid var(--ls-border-color); 
        padding: 6px 10px; 
    }
    #right-sidebar #ai-sidebar-container .ai-bubble-content th { 
        background: var(--ls-tertiary-background-color); 
        font-weight: bold; 
    }

    /* 🌟 3. Logseq 頁面連結修正 (自帶 <span class="logseq-page-ref" data-on-click="openPage" data-page-name=" "> </span> 的視覺效果) */
    #right-sidebar #ai-sidebar-container .ai-bubble-content .logseq-page-ref { 
        color: var(--ls-link-text-color); 
        cursor: pointer; 
        font-weight: 500;
        text-decoration: none;
    }
    #right-sidebar #ai-sidebar-container .ai-bubble-content .logseq-page-ref:hover {
        text-decoration: underline;
    }
    #right-sidebar #ai-sidebar-container .ai-bubble-content .logseq-page-ref::before,
    #right-sidebar #ai-sidebar-container .ai-bubble-content .logseq-page-ref::after {
        content: "[[";
        color: var(--ls-link-text-color);
        opacity: 0.4;
    }
    #right-sidebar #ai-sidebar-container .ai-bubble-content .logseq-page-ref::after {
        content: "]]";
    }

    /* 🌟 4. 引用區塊修正 */
    #right-sidebar #ai-sidebar-container .ai-bubble-content blockquote {
        border-left: 3px solid var(--ls-active-primary-color);
        margin-left: 0;
        margin-right: 0;
        color: var(--ls-secondary-text-color);
        background: var(--ls-secondary-background-color);
        padding: 8px 12px;
        border-radius: 0 4px 4px 0;
    }

    /* 🌟 5. 列表修正 (覆蓋掉 Logseq 的 list-style: none) */
    #right-sidebar #ai-sidebar-container .ai-bubble-content ul {
        padding-left: 20px;
        list-style-type: disc !important;
        margin: 8px 0;
    }
    #right-sidebar #ai-sidebar-container .ai-bubble-content ol {
        padding-left: 20px;
        list-style-type: decimal !important;
        margin: 8px 0;
    }

    /* 🌟 6. 程式碼區塊防溢出與美化 */
    #right-sidebar #ai-sidebar-container .ai-bubble-content pre {
        background: var(--ls-primary-background-color);
        padding: 12px;
        border-radius: 6px;
        border: 1px solid var(--ls-border-color);
        overflow-x: auto;
        margin: 8px 0;
    }
    #right-sidebar #ai-sidebar-container .ai-bubble-content code {
        font-family: monospace;
        background: var(--ls-tertiary-background-color);
        padding: 2px 4px;
        border-radius: 4px;
        font-size: 0.9em !important;
    }
    
    /* 不要讓大區塊的 Code 有重複背景 */
    #right-sidebar #ai-sidebar-container .ai-bubble-content pre code {
        background: transparent;
        padding: 0;
    }

    /* 段落邊距微調 */
    #right-sidebar #ai-sidebar-container .ai-bubble-content p {
        margin-top: 0;
        margin-bottom: 8px;
    }
    #right-sidebar #ai-sidebar-container .ai-bubble-content p:last-child {
        margin-bottom: 0px;
    }
`;