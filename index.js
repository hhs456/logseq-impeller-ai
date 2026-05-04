// ==========================================
// 📦 CONFIG & STATE
// ==========================================
const CONFIG = {
    i18n: {
        "zh-TW": {
            langName: "繁體中文 (Traditional Chinese)",
            baseCondition: "你是一個 Logseq 專家。請產出結構化的 Markdown 縮排清單。嚴禁廢話。保留 [[雙向連結]] 與 #標籤。",
            applyReformat: "【任務：純重構】目前無對話指令。請僅優化目前頁面的縮排架構，不要增加新資訊。",
            applyContext: "【任務：智慧執行】請分析對話紀錄：\n1. 若用戶要求『重構』或『整理』全文，請輸出重構後的完整內容。\n2. 若用戶要求『補充』、『延伸』或『新增』，請僅輸出新產出的 Markdown 內容區塊。\n只輸出 Markdown 結果，不要有任何前言。",
            welcome: "🤖 AI 助理已就緒。可以開始對話或點擊「套用」。",
            thinking: "⏳ AI 正在構思中...",
            working: "⏳ AI 正在執行智慧套用，請稍候...",
            done: "✅ 處理完成",
            stopBtn: "⏹️",
            applyBtn: "✨ 套用",
            clearBtn: "🗑️",
            placeholder: "輸入需求 (Enter 傳送 / Shift+Enter 換行)...",
            tagDefault: "🤖 AI 處理結果",
            error: "❌ 錯誤: ",
            aiBtnText: "AI 助理",
            aborted: "⚠️ 任務已手動中斷",
            processingOther: "⏳ 正在為「{name}」處理中...",
            bgPage: "背景頁面",            
            bgChatDone: "💬 「{name}」的 AI 回應已準備就緒" 
        },
        "en": {
            langName: "English",
            baseCondition: "Logseq expert. Use structured Markdown lists. Preserve [[Backlinks]] and #Tags.",
            applyReformat: "Intent: Pure Reformat. Optimize indentation only.",
            applyContext: "Intent: Smart Apply. If history asks for 'refactor', output full page. If history asks for 'addition' or 'ideas', output ONLY the new blocks.",
            welcome: "🤖 AI Assistant ready. Chat or click 'Apply'.",
            thinking: "⏳ AI is thinking...",
            working: "⏳ AI is applying changes...",
            done: "✅ Done",
            stopBtn: "⏹️",
            applyBtn: "✨ Apply",
            clearBtn: "🗑️",
            placeholder: "Enter needs...",
            tagDefault: "🤖 AI Result",
            error: "❌ Error: ",
            aiBtnText: "AI Assistant",
            aborted: "⚠️ Task aborted",
            processingOther: "⏳ Processing for '{name}'...",
            bgPage: "Background Page",            
            bgChatDone: "💬 AI response for '{name}' is ready" 
        }
    },
    state: {
        chatStore: {}, currentPageUuid: null, isBusy: false, isVisible: false, isCollapsed: false,
        tempInput: "", t: null, abortController: null, timer: null,
        processingPageUuid: null
    }
};

const ls = window.logseq;

// ==========================================
// 🛠️ LOGIC ENGINE
// ==========================================
function startBusyFeedback() {
    const state = CONFIG.state;
    if (state.timer) clearInterval(state.timer);
    ls.UI.showMsg(state.t.working, 'info');
    state.timer = setInterval(() => {
        if (state.isBusy) ls.UI.showMsg(state.t.working, 'info');
    }, 4000);
}

function stopBusyFeedback() {
    const state = CONFIG.state;
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
}

async function writeToLogseq(aiMarkdown, targetUuid) {
    const { tag } = ls.settings;
    const tagText = tag || CONFIG.state.t.tagDefault;

    const cleanMarkdown = aiMarkdown
        .replace(/```markdown/g, '')
        .replace(/```/g, '')
        .trim();

    const blockTree = cleanMarkdown.split('\n')
        .filter(l => l.trim() !== '')
        .map(l => ({
            content: l.replace(/^\s*[-*]\s+/, '').trim()
        }));

    const blocks = await ls.Editor.getPageBlocksTree(targetUuid);

    const findOld = (tree) => {
        for (let b of tree) {
            if (b.content.includes(tagText)) return b;
            if (b.children) { const res = findOld(b.children); if (res) return res; }
        }
    };

    const oldBlock = findOld(blocks || []);
    if (oldBlock) await ls.Editor.removeBlock(oldBlock.uuid);

    const last = blocks[blocks.length - 1];
    if (last) {
        const title = await ls.Editor.insertBlock(last.uuid, `### ${tagText}`, { sibling: true });
        await ls.Editor.insertBatchBlock(title.uuid, blockTree, { sibling: true });
    }
}

const actions = {
    async updatePageContext() {
        const state = CONFIG.state;
        let page = await ls.Editor.getCurrentPage();
        if (page) {
            if (page.page) page = await ls.Editor.getPage(page.page.id);
            state.currentPageUuid = page.uuid;
            const pageName = page.originalName || page.name;
            if (!state.chatStore[page.uuid]) state.chatStore[page.uuid] = { name: pageName, msgs: [] };
        } else {
            state.currentPageUuid = null;
        }
    },

    async togglePortal() {
        const state = CONFIG.state;
        state.isVisible = !state.isVisible;
        if (state.isVisible) {
            await this.updatePageContext();
            await ls.App.setRightSidebarVisible(true);
            setTimeout(() => renderUI(), 150);
        } else { renderUI(); }
    },
    toggleCollapse() { CONFIG.state.isCollapsed = !CONFIG.state.isCollapsed; renderUI(); },
    hidePortal() { CONFIG.state.isVisible = false; renderUI(); },
    clearChat() { if (CONFIG.state.currentPageUuid) CONFIG.state.chatStore[CONFIG.state.currentPageUuid].msgs = []; renderUI(); },
    stopTask() { if (CONFIG.state.abortController) CONFIG.state.abortController.abort(); },

    async callAI(messages, useNotification = false) {
        const state = CONFIG.state;
        state.isBusy = true;
        state.abortController = new AbortController();
        if (useNotification) startBusyFeedback();
        renderUI();
        try {
            const { apiKey, model, basePath } = ls.settings;
            const response = await fetch(`${basePath}/chat/completions`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model, messages }),
                signal: state.abortController.signal
            });
            const data = await response.json();
            return data.choices?.[0]?.message?.content;
        } catch (e) {
            if (e.name === 'AbortError') {
                ls.UI.showMsg(state.t.aborted, 'warning');
            } else {
                ls.UI.showMsg(state.t.error + e.message, 'error');
            }
            return null;
        } finally {
            state.isBusy = false;
            state.abortController = null;
            state.processingPageUuid = null; 
            if (useNotification) stopBusyFeedback();
            renderUI();
        }
    },

    async sendMsg() {
        const state = CONFIG.state;
        if (!state.tempInput.trim() || state.isBusy || !state.currentPageUuid) return;
        
        const targetUuid = state.currentPageUuid; 
        state.processingPageUuid = targetUuid; 

        state.chatStore[targetUuid].msgs.push({ role: "user", content: state.tempInput });
        state.tempInput = "";
        
        const blocks = await ls.Editor.getPageBlocksTree(targetUuid);
        const getTxt = (tree) => tree.reduce((acc, b) => acc + b.content + '\n' + (b.children ? getTxt(b.children) : ''), '');
        const system = `Respond ALWAYS in ${state.t.langName}.\nCurrent Page:\n${getTxt(blocks)}`;
        
        const res = await this.callAI([{ role: "system", content: system }, ...state.chatStore[targetUuid].msgs], false);
        
        if (res) {
            state.chatStore[targetUuid].msgs.push({ role: "assistant", content: res });
            
            // 💡 如果處理完畢時，畫面已經不在當初發問的頁面了，就推播通知
            if (state.currentPageUuid !== targetUuid) {
                const pageName = state.chatStore[targetUuid]?.name || state.t.bgPage;
                ls.UI.showMsg(state.t.bgChatDone.replace('{name}', pageName), 'success');
            }
            
            // 💡 確保資料寫入後，UI 會立即更新對話氣泡
            renderUI();
        }
    },

    async applyToPage() {
        const state = CONFIG.state;
        if (state.isBusy || !state.currentPageUuid) return;
        
        const targetUuid = state.currentPageUuid;
        state.processingPageUuid = targetUuid; 
        const chatHistory = state.chatStore[targetUuid]?.msgs || [];
        
        const blocks = await ls.Editor.getPageBlocksTree(targetUuid);
        const getTxt = (tree) => tree.reduce((acc, b) => acc + b.content + '\n' + (b.children ? getTxt(b.children) : ''), '');

        let instruction = chatHistory.length === 0 ? state.t.applyReformat : state.t.applyContext;
        const system = `Respond ALWAYS in ${state.t.langName}.\n${CONFIG.state.t.baseCondition}\n${instruction}`;

        const res = await this.callAI([
            { role: "system", content: system },
            { role: "user", content: `Original Page Content:\n${getTxt(blocks)}` },
            ...chatHistory,
            { role: "user", content: "Execute mission and output results in Markdown now." }
        ], true);

        if (res) { 
            await writeToLogseq(res, targetUuid); 
            ls.UI.showMsg(state.t.done, 'success'); 
        }
    }
};

// ==========================================
// 🎨 UI RENDER
// ==========================================
function renderUI() {
    if (!CONFIG.state.isVisible) { ls.provideUI({ key: 'ai-sidebar', template: '' }); return; }
    const state = CONFIG.state;
    const currentData = state.chatStore[state.currentPageUuid] || { msgs: [] };
    const isBusy = state.isBusy;

    let busyMessage = state.t.thinking;
    if (isBusy && state.processingPageUuid && state.processingPageUuid !== state.currentPageUuid) {
        const processingName = state.chatStore[state.processingPageUuid]?.name || state.t.bgPage;
        busyMessage = state.t.processingOther.replace('{name}', processingName);
    }

    const template = `
    <style>
        .ai-pulse { animation: ai-blink 1.4s infinite both; }
        @keyframes ai-blink { 0% { opacity: .2; } 50% { opacity: 1; } 100% { opacity: .2; } }
        
        .ai-btn-action { 
            cursor: pointer; 
            border: 1px solid var(--ls-border-color); 
            border-radius: 6px; 
            font-size: 11px; 
            background: var(--ls-primary-background-color); 
            color: var(--ls-primary-text-color);
            padding: 6px;
            transition: all 0.2s ease;
            outline: none;
            display: flex; align-items: center; justify-content: center;
        }
        
        .ai-btn-action:hover:not(:disabled) { 
            border-color: var(--ls-active-primary-color) !important;
            background: var(--ls-secondary-background-color) !important;
            box-shadow: 0 2px 6px rgba(0,0,0,0.15) !important;
            opacity: 1 !important; 
            transform: translateY(-1px); 
        }
        
        .ai-btn-action:disabled { 
            opacity: 0.3 !important; 
            cursor: not-allowed; 
            filter: grayscale(1);
        }

        .ai-stop-btn { background: #e74c3c !important; color: white !important; border: none !important; opacity: 0.9 !important; }
        .ai-stop-btn:hover { background: #c0392b !important; opacity: 1 !important; }
    </style>
    <div id="ai-sidebar-container" class="sidebar-item" style="margin: 8px; border: 1px solid var(--ls-border-color); background: var(--ls-primary-background-color); border-radius: 8px; overflow: hidden; display: flex; flex-direction: column;">
        <div class="header" data-on-click="toggleCollapse" style="padding: 10px 15px; background: var(--ls-secondary-background-color); border-bottom: 1px solid var(--ls-border-color); display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 10px; opacity: 0.5;">${state.isCollapsed ? '▶' : '▼'}</span>
                <span style="font-weight: 600; font-size: 0.85em; opacity: 0.8;">🤖 ${state.t.aiBtnText.toUpperCase()}</span>
            </div>
            <a data-on-click="hidePortal" style="opacity: 0.5; padding: 4px;">✕</a>
        </div>
        <div style="display: ${state.isCollapsed ? 'none' : 'flex'}; flex-direction: column; height: 500px;">
            <div id="ai-chat-history-scroll" style="flex: 1; padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px;">
                ${currentData.msgs.length === 0 ? `<div style="font-size: 13px; padding: 10px; opacity: 0.6;">${state.t.welcome}</div>` : 
                    currentData.msgs.map(m => `
                    <div style="align-self: ${m.role === 'user' ? 'flex-end' : 'flex-start'}; max-width: 85%;">
                        <div style="padding: 8px 12px; border-radius: 12px; font-size: 13px; line-height: 1.5; 
                            background: ${m.role === 'user' ? 'var(--ls-quaternary-background-color)' : 'var(--ls-secondary-background-color)'}; 
                            color: var(--ls-primary-text-color); border: 1px solid var(--ls-border-color);">
                            ${m.content.replace(/\n/g, '<br>')}
                        </div>
                    </div>`).join('')}
                ${isBusy ? `<div style="align-self: flex-start; max-width: 85%;"><div class="ai-pulse" style="padding: 8px 12px; font-size: 13px; opacity: 0.6; font-style: italic; color: var(--ls-active-primary-color); font-weight: 600;">${busyMessage}</div></div>` : ''}
            </div>
            <div style="padding: 12px; background: var(--ls-secondary-background-color); border-top: 1px solid var(--ls-border-color);">
                <textarea id="ai-sidebar-textarea" rows="2" placeholder="${state.t.placeholder}" style="width: 100%; background: var(--ls-primary-background-color); color: var(--ls-primary-text-color); border: 1px solid var(--ls-border-color); border-radius: 6px; padding: 10px; font-size: 13px; resize: none; outline: none; margin-bottom: 8px; box-sizing: border-box;" ${isBusy ? 'disabled' : ''}></textarea>
                <div style="display: flex; gap: 6px;">
                    <button data-on-click="clearChat" class="ai-btn-action" style="flex: 0.2; opacity: 0.7; border: 1px solid var(--ls-border-color); border-radius: 6px;" ${isBusy ? 'disabled' : ''}>${state.t.clearBtn}</button>
                    
                    <button data-on-click="applyToPage" class="ai-btn-action" style="flex: 0.6; font-weight: bold; opacity: 0.85; border: 1px solid var(--ls-border-color); border-radius: 6px;" ${isBusy ? 'disabled' : ''}>${state.t.applyBtn}</button>
                    
                    ${isBusy 
                        ? `<button data-on-click="stopTask" class="ai-btn-action ai-stop-btn" style="flex: 0.2; border-radius: 6px;">${state.t.stopBtn}</button>` 
                        : `<button data-on-click="sendMsg" class="ai-btn-action" style="flex: 0.2; background: var(--ls-quaternary-background-color); border: 1px solid var(--ls-border-color); border-radius: 6px; opacity: 0.9;">➤</button>`}
                </div>
            </div>
        </div>
    </div>
    `;

    ls.provideUI({ key: 'ai-sidebar', path: '#right-sidebar .sidebar-item-list', template });

    setTimeout(() => {
        const textarea = parent.document.getElementById('ai-sidebar-textarea');
        if (textarea) {
            textarea.value = state.tempInput;
            textarea.oninput = (e) => { CONFIG.state.tempInput = e.target.value; };
            textarea.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey && !isBusy) { e.preventDefault(); e.stopPropagation(); actions.sendMsg(); } };
        }
        const hist = parent.document.getElementById('ai-chat-history-scroll');
        if (hist) hist.scrollTop = hist.scrollHeight;
    }, 50);
}

async function main() {
    const config = await ls.App.getUserConfigs();
    CONFIG.state.t = (config.preferredLanguage?.startsWith("zh")) ? CONFIG.i18n["zh-TW"] : CONFIG.i18n["en"];
    ls.useSettingsSchema([
        { key: "apiKey", type: "string", title: "1. API Key", default: "" },
        { key: "model", type: "string", title: "2. Model", default: "openai/gpt-4o-mini" },
        { key: "basePath", type: "string", title: "3. API Endpoint", default: "https://openrouter.ai/api/v1" },
        { key: "tag", type: "string", title: "4. Custom Tag", default: CONFIG.state.t.tagDefault }
    ]);
    ls.provideModel(actions);
    ls.App.registerUIItem('toolbar', { key: 'ai-portal-btn', template: `<a class="button" data-on-click="togglePortal" style="font-size: 13px; font-weight: 600; padding: 0 8px; color: var(--ls-icon-color); opacity: 0.8;">${CONFIG.state.t.aiBtnText}</a>` });

    ls.App.onRouteChanged(async () => {
        if (CONFIG.state.isVisible) {
            await actions.updatePageContext();
            renderUI();
        }
    });
}
ls.ready(main).catch(console.error);