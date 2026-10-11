// src/ui/styles.ts

export const SIDEBAR_CSS = `
    /* ── 本插件變數中樞：其餘樣式只引用 --ai-* ── */
    #right-sidebar #ai-sidebar-container {
        --ai-accent: var(--ls-link-text-color, #4a90e2);
        --ai-border: var(--ls-border-color, #e3e3e3);
        --ai-bg: var(--ls-primary-background-color, #ffffff);
        --ai-bg-secondary: var(--ls-secondary-background-color, #f6f6f6);
        --ai-bg-tertiary: var(--ls-tertiary-background-color, #eeeeee);
        --ai-bg-quaternary: var(--ls-quaternary-background-color, #e6e6e6);
        --ai-text: var(--ls-primary-text-color, #1c1c1c);
        --ai-text-secondary: var(--ls-secondary-text-color, #5a5a5a);
        --ai-error: var(--ls-error-text-color, #d93b3b);

        --ai-hl-keyword: #a626a4;
        --ai-hl-string: #50a14f;
        --ai-hl-number: #986801;
        --ai-hl-comment: #a0a1a7;
        --ai-hl-title: #4078f2;
        --ai-hl-built_in: #c18401;
        --ai-hl-attr: #986801;
        --ai-hl-literal: #986801;
        --ai-hl-meta: #4078f2;

        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        padding: 10px;
        height: calc(100dvh - var(--ai-sidebar-offset, 100px));
        min-height: 280px;
        color: var(--ai-text);
    }
    #right-sidebar #ai-sidebar-container.is-collapsed {
        height: auto;
        min-height: 0;
    }

    /* 深色主題覆寫（V4：雙選擇器並存） */
    .dark-theme #right-sidebar #ai-sidebar-container,
    html[data-theme="dark"] #right-sidebar #ai-sidebar-container {
        --ai-hl-keyword: #c678dd;
        --ai-hl-string: #98c379;
        --ai-hl-number: #d19a66;
        --ai-hl-comment: #7f848e;
        --ai-hl-title: #61afef;
        --ai-hl-built_in: #e6c07b;
        --ai-hl-attr: #d19a66;
        --ai-hl-literal: #d19a66;
        --ai-hl-meta: #56b6c2;
    }

    /* ── 外殼 ── */
    #right-sidebar #ai-sidebar-container .ai-shell {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--ai-bg);
        border: 1px solid var(--ai-border);
        border-radius: 10px;
        overflow: hidden;
    }
    #right-sidebar #ai-sidebar-container.is-collapsed .ai-shell { height: auto; }
    #right-sidebar #ai-sidebar-container .ai-body {
        display: flex;
        flex-direction: column;
        flex: 1;
        overflow: hidden;
    }
    #right-sidebar #ai-sidebar-container.is-collapsed .ai-body { display: none; }

    /* ── Header ── */
    #right-sidebar #ai-sidebar-container .ai-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 12px;
        background: var(--ai-bg-secondary);
        border-bottom: 1px solid var(--ai-border);
        flex-shrink: 0;
    }
    #right-sidebar #ai-sidebar-container .ai-header-toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        background: none;
        border: none;
        padding: 2px 4px;
        cursor: pointer;
        color: var(--ai-text);
        font: inherit;
    }
    #right-sidebar #ai-sidebar-container .ai-header-title {
        font-weight: 600;
        font-size: 0.85em;
        opacity: 0.85;
        letter-spacing: 0.3px;
    }
    #right-sidebar #ai-sidebar-container .ai-chevron { font-size: 10px; opacity: 0.5; }
    #right-sidebar #ai-sidebar-container .ai-header-actions { display: flex; align-items: center; gap: 4px; }
    #right-sidebar #ai-sidebar-container .ai-icon-btn {
        background: none;
        border: none;
        padding: 4px;
        cursor: pointer;
        opacity: 0.55;
        font-size: 12px;
        line-height: 1;
        color: var(--ai-text);
        border-radius: 4px;
    }
    #right-sidebar #ai-sidebar-container .ai-icon-btn:hover { opacity: 1; }

    /* ── 記憶庫 chip 列 ── */
    #right-sidebar #ai-sidebar-container .ai-memory-section {
        background: var(--ai-bg-tertiary);
        border-bottom: 1px solid var(--ai-border);
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
    }
    #right-sidebar #ai-sidebar-container .ai-memory-toggle {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        background: var(--ai-bg-secondary);
        border: none;
        border-bottom: 1px dashed var(--ai-border);
        cursor: pointer;
        color: var(--ai-text);
        user-select: none;
        font: inherit;
    }
    #right-sidebar #ai-sidebar-container .ai-memory-section.is-collapsed .ai-memory-toggle { border-bottom: none; }
    #right-sidebar #ai-sidebar-container .ai-memory-title { font-size: 11px; font-weight: bold; opacity: 0.6; letter-spacing: 0.5px; }
    #right-sidebar #ai-sidebar-container .ai-memory-count {
        font-size: 10px; opacity: 0.55; background: var(--ai-bg);
        padding: 1px 6px; border-radius: 10px; font-weight: bold;
    }
    #right-sidebar #ai-sidebar-container .ai-memory-scrollbar-container {
        display: flex;
        flex-direction: row;
        flex-wrap: nowrap;
        gap: 6px;
        overflow-x: auto;
        padding: 10px 14px;
        width: 100%;
        box-sizing: border-box;
        align-items: center;
    }
    #right-sidebar #ai-sidebar-container .ai-memory-section.is-collapsed .ai-memory-scrollbar-container { display: none; }
    #right-sidebar #ai-sidebar-container .ai-memory-page-link {
        cursor: pointer;
        padding: 4px 10px;
        background: var(--ai-bg);
        border: 1px solid var(--ai-border);
        border-radius: 6px;
        font-size: 11px;
        white-space: nowrap;
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: var(--ai-text);
        opacity: 0.85;
        transition: all 0.15s;
        font-family: inherit;
    }
    #right-sidebar #ai-sidebar-container .ai-memory-page-link:hover {
        background: var(--ai-bg-secondary);
        border-color: var(--ai-accent);
        opacity: 1;
        transform: translateY(-1px);
    }

    /* ── 對話區（細捲軸，與 chip 列同款） ── */
    #right-sidebar #ai-sidebar-container .ai-history-wrapper {
        flex: 1;
        min-height: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }
    #right-sidebar #ai-sidebar-container .ai-history {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 15px;
        display: flex;
        flex-direction: column;
        background: var(--ai-bg);
        border-bottom: 1px solid var(--ai-border);
        box-sizing: border-box;
    }
    #right-sidebar #ai-sidebar-container .ai-history::-webkit-scrollbar,
    #right-sidebar #ai-sidebar-container .ai-memory-scrollbar-container::-webkit-scrollbar { width: 6px; height: 4px; }
    #right-sidebar #ai-sidebar-container .ai-history::-webkit-scrollbar-track,
    #right-sidebar #ai-sidebar-container .ai-memory-scrollbar-container::-webkit-scrollbar-track { background: transparent; }
    #right-sidebar #ai-sidebar-container .ai-history::-webkit-scrollbar-thumb,
    #right-sidebar #ai-sidebar-container .ai-memory-scrollbar-container::-webkit-scrollbar-thumb { background: var(--ai-border); border-radius: 10px; }
    #right-sidebar #ai-sidebar-container .ai-history::-webkit-scrollbar-thumb:hover,
    #right-sidebar #ai-sidebar-container .ai-memory-scrollbar-container::-webkit-scrollbar-thumb:hover { background: var(--ai-accent); }

    #right-sidebar #ai-sidebar-container .ai-welcome {
        font-size: 14px; padding: 20px; opacity: 0.5; text-align: center; line-height: 1.6;
    }
    #right-sidebar #ai-sidebar-container .chat-bubble-container {
        display: flex; flex-direction: column; width: 100%; margin-bottom: 12px;
    }
    #right-sidebar #ai-sidebar-container .chat-bubble-container.is-user { align-items: flex-end; }
    #right-sidebar #ai-sidebar-container .chat-bubble-container.is-assistant { align-items: flex-start; }
    #right-sidebar #ai-sidebar-container .ai-bubble-user,
    #right-sidebar #ai-sidebar-container .ai-bubble-assistant {
        max-width: 85%;
        padding: 10px 14px;
        border-radius: 10px;
        font-size: 14px;
        line-height: 1.5;
        box-sizing: border-box;
        border: 1px solid var(--ai-border);
    }
    #right-sidebar #ai-sidebar-container .ai-bubble-user {
        background: var(--ai-bg-secondary);
        border-right: 3px solid var(--ai-accent);
    }
    #right-sidebar #ai-sidebar-container .ai-bubble-assistant {
        background: var(--ai-bg-tertiary);
        border-left: 3px solid var(--ai-border);
    }
    #right-sidebar #ai-sidebar-container .ai-busy {
        align-self: flex-start;
        max-width: 85%;
        background: var(--ai-bg-tertiary);
        padding: 10px 14px;
        border-radius: 10px;
        font-size: 13px;
        opacity: 0.6;
        font-style: italic;
        margin-bottom: 12px;
    }

    /* ── 動作列與動作鈕（去掉 opacity:0.3，改用次要文字色） ── */
    #right-sidebar #ai-sidebar-container .ai-action-row { display: flex; gap: 10px; margin-top: 4px; font-size: 11px; }
    #right-sidebar #ai-sidebar-container .chat-bubble-container.is-user .ai-action-row { justify-content: flex-end; margin-right: 6px; }
    #right-sidebar #ai-sidebar-container .chat-bubble-container.is-assistant .ai-action-row { margin-left: 6px; }
    #right-sidebar #ai-sidebar-container .ai-action-link {
        background: none; border: none; padding: 0; cursor: pointer;
        color: var(--ai-text-secondary); font: inherit; font-size: 11px;
    }
    #right-sidebar #ai-sidebar-container .ai-action-link:hover { color: var(--ai-accent); }

    /* ── 輸入區 ── */
    #right-sidebar #ai-sidebar-container .ai-input-area {
        padding: 12px;
        background: var(--ai-bg-secondary);
        border-top: 1px solid var(--ai-border);
        flex-shrink: 0;
    }
    #right-sidebar #ai-sidebar-container .ai-textarea {
        width: 100%;
        background: var(--ai-bg);
        color: var(--ai-text);
        border: 1px solid var(--ai-border);
        border-radius: 6px;
        padding: 10px;
        font-size: 13px;
        resize: none;
        outline: none;
        margin-bottom: 8px;
        box-sizing: border-box;
        font-family: inherit;
    }
    #right-sidebar #ai-sidebar-container .ai-input-row { display: flex; gap: 6px; }
    #right-sidebar #ai-sidebar-container .ai-btn-action {
        flex: 1;
        padding: 6px 2px;
        opacity: 0.85;
        background: var(--ai-bg);
        color: var(--ai-text);
        border: 1px solid var(--ai-border);
        border-radius: 6px;
        cursor: pointer;
        font: inherit;
        font-size: 12px;
    }
    #right-sidebar #ai-sidebar-container .ai-btn-action:hover { opacity: 1; }
    #right-sidebar #ai-sidebar-container .ai-send-toggle { flex: 0.8; font-weight: bold; }
    #right-sidebar #ai-sidebar-container .ai-send-btn { background: var(--ai-bg-quaternary); }
    #right-sidebar #ai-sidebar-container .ai-stop-btn {
        background: var(--ai-error);
        color: #fff;
        border-color: transparent;
    }

    /* ── 氣泡內文排版（覆蓋 Logseq 全域，以雙 id 特異性取代 !important） ── */
    #right-sidebar #ai-sidebar-container .ai-bubble-content {
        font-size: 14px;
        line-height: 1.5;
        color: var(--ai-text);
        word-wrap: break-word;
        -webkit-user-select: text;
        user-select: text;
        cursor: text;
    }
    #right-sidebar #ai-sidebar-container .ai-bubble-content h1 { font-size: 1.6em; font-weight: bold; margin: 0.6em 0; border-bottom: 1px solid var(--ai-border); padding-bottom: 0.3em; }
    #right-sidebar #ai-sidebar-container .ai-bubble-content h2 { font-size: 1.4em; font-weight: bold; margin: 0.5em 0; }
    #right-sidebar #ai-sidebar-container .ai-bubble-content h3 { font-size: 1.25em; font-weight: bold; margin: 0.5em 0; }
    #right-sidebar #ai-sidebar-container .ai-bubble-content h4,
    #right-sidebar #ai-sidebar-container .ai-bubble-content h5,
    #right-sidebar #ai-sidebar-container .ai-bubble-content h6 { font-size: 1.1em; font-weight: bold; margin: 0.5em 0; }

    #right-sidebar #ai-sidebar-container .ai-bubble-content table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 13px; }
    #right-sidebar #ai-sidebar-container .ai-bubble-content th,
    #right-sidebar #ai-sidebar-container .ai-bubble-content td { border: 1px solid var(--ai-border); padding: 6px 10px; }
    #right-sidebar #ai-sidebar-container .ai-bubble-content th { background: var(--ai-bg-tertiary); font-weight: bold; }

    #right-sidebar #ai-sidebar-container .ai-bubble-content blockquote {
        border-left: 3px solid var(--ai-accent);
        margin: 0;
        color: var(--ai-text-secondary);
        background: var(--ai-bg-secondary);
        padding: 8px 12px;
        border-radius: 0 4px 4px 0;
    }

    #right-sidebar #ai-sidebar-container .ai-bubble-content ul { padding-left: 20px; list-style-type: disc; margin: 8px 0; }
    #right-sidebar #ai-sidebar-container .ai-bubble-content ol { padding-left: 20px; list-style-type: decimal; margin: 8px 0; }
    #right-sidebar #ai-sidebar-container .ai-bubble-content li { margin: 2px 0; }

    #right-sidebar #ai-sidebar-container .ai-bubble-content pre {
        background: var(--ai-bg);
        padding: 12px;
        border-radius: 6px;
        border: 1px solid var(--ai-border);
        overflow-x: auto;
        margin: 8px 0;
    }
    #right-sidebar #ai-sidebar-container .ai-bubble-content code {
        font-family: var(--ls-code-font-family, monospace);
        background: var(--ai-bg-tertiary);
        padding: 2px 4px;
        border-radius: 4px;
        font-size: 0.9em;
    }
    #right-sidebar #ai-sidebar-container .ai-bubble-content pre code { background: transparent; padding: 0; }
    #right-sidebar #ai-sidebar-container .ai-bubble-content p { margin-top: 0; margin-bottom: 8px; }
    #right-sidebar #ai-sidebar-container .ai-bubble-content p:last-child { margin-bottom: 0; }

    #right-sidebar #ai-sidebar-container .ai-bubble-content .ai-task-box { color: var(--ai-accent); margin-right: 4px; }

    #right-sidebar #ai-sidebar-container .ai-chat-time {
        font-size: 10px;
        color: var(--ai-text-secondary);
        opacity: 0.7;
        display: block;
        text-align: right;
        margin-top: 6px;
        user-select: none;
    }

    /* ── 程式碼區塊容器與 Copy 鈕 ── */
    #right-sidebar #ai-sidebar-container .ai-bubble-content .ai-code-block { position: relative; margin-bottom: 1em; }
    #right-sidebar #ai-sidebar-container .ai-bubble-content .ai-copy-code-btn {
        position: absolute;
        top: 4px;
        right: 4px;
        padding: 2px 6px;
        font-size: 12px;
        opacity: 0.7;
        cursor: pointer;
        border-radius: 4px;
        background: var(--ai-bg-secondary);
        border: 1px solid var(--ai-border);
        color: var(--ai-text);
        user-select: none;
    }
    #right-sidebar #ai-sidebar-container .ai-bubble-content .ai-copy-code-btn:hover { opacity: 1; }

    #right-sidebar #ai-sidebar-container .ai-bubble-content .ai-chat-wiki-link {
        color: var(--ai-accent);
        cursor: pointer;
        text-decoration: underline;
        font-weight: 500;
    }

    /* ── 語法高亮主題（hljs token → --ai-hl-*） ── */
    #right-sidebar #ai-sidebar-container .ai-bubble-content .hljs-keyword,
    #right-sidebar #ai-sidebar-container .ai-bubble-content .hljs-selector-tag,
    #right-sidebar #ai-sidebar-container .ai-bubble-content .hljs-literal { color: var(--ai-hl-keyword); }
    #right-sidebar #ai-sidebar-container .ai-bubble-content .hljs-string,
    #right-sidebar #ai-sidebar-container .ai-bubble-content .hljs-addition { color: var(--ai-hl-string); }
    #right-sidebar #ai-sidebar-container .ai-bubble-content .hljs-number,
    #right-sidebar #ai-sidebar-container .ai-bubble-content .hljs-quote { color: var(--ai-hl-number); }
    #right-sidebar #ai-sidebar-container .ai-bubble-content .hljs-comment,
    #right-sidebar #ai-sidebar-container .ai-bubble-content .hljs-deletion { color: var(--ai-hl-comment); font-style: italic; }
    #right-sidebar #ai-sidebar-container .ai-bubble-content .hljs-title,
    #right-sidebar #ai-sidebar-container .ai-bubble-content .hljs-name,
    #right-sidebar #ai-sidebar-container .ai-bubble-content .hljs-section { color: var(--ai-hl-title); }
    #right-sidebar #ai-sidebar-container .ai-bubble-content .hljs-built_in,
    #right-sidebar #ai-sidebar-container .ai-bubble-content .hljs-type,
    #right-sidebar #ai-sidebar-container .ai-bubble-content .hljs-class { color: var(--ai-hl-built_in); }
    #right-sidebar #ai-sidebar-container .ai-bubble-content .hljs-attr,
    #right-sidebar #ai-sidebar-container .ai-bubble-content .hljs-attribute,
    #right-sidebar #ai-sidebar-container .ai-bubble-content .hljs-variable,
    #right-sidebar #ai-sidebar-container .ai-bubble-content .hljs-template-variable { color: var(--ai-hl-attr); }
    #right-sidebar #ai-sidebar-container .ai-bubble-content .hljs-meta,
    #right-sidebar #ai-sidebar-container .ai-bubble-content .hljs-symbol,
    #right-sidebar #ai-sidebar-container .ai-bubble-content .hljs-bullet,
    #right-sidebar #ai-sidebar-container .ai-bubble-content .hljs-link { color: var(--ai-hl-meta); }

    /* ── 無障礙：視覺隱藏 status 區、focus ring ── */
    #right-sidebar #ai-sidebar-container .ai-visually-hidden {
        position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
        overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
    }
    #right-sidebar #ai-sidebar-container button:focus-visible,
    #right-sidebar #ai-sidebar-container a:focus-visible,
    #right-sidebar #ai-sidebar-container textarea:focus-visible {
        outline: 2px solid var(--ai-accent);
        outline-offset: 1px;
    }

    /* ── 降低動態效果 ── */
    @media (prefers-reduced-motion: reduce) {
        #right-sidebar #ai-sidebar-container *,
        #right-sidebar #ai-sidebar-container *::before,
        #right-sidebar #ai-sidebar-container *::after {
            transition: none !important;
            transform: none !important;
        }
    }

    /* ── P6：工具軌跡與串流氣泡 ── */
    #right-sidebar #ai-sidebar-container .ai-trace {
        margin-top: 4px;
        font-size: 11px;
        color: var(--ai-text-secondary);
        max-width: 85%;
    }
    #right-sidebar #ai-sidebar-container .ai-trace > summary { cursor: pointer; user-select: none; opacity: 0.7; }
    #right-sidebar #ai-sidebar-container .ai-trace ul { margin: 4px 0 0; padding-left: 18px; list-style-type: none; }
    #right-sidebar #ai-sidebar-container .ai-trace li { margin: 1px 0; word-break: break-word; }
    #right-sidebar #ai-sidebar-container .ai-trace code { background: var(--ai-bg-tertiary); padding: 0 3px; border-radius: 3px; font-size: 10px; }
    #right-sidebar #ai-sidebar-container .ai-trace-args { opacity: 0.8; }
    #right-sidebar #ai-sidebar-container .ai-trace-ms { opacity: 0.5; }
    #right-sidebar #ai-sidebar-container #ai-stream-bubble .ai-bubble-assistant { border-left: 3px solid var(--ai-accent); }
`;
