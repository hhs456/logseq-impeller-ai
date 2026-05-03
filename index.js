// index.js

// ==========================================
// 📦 模組一：CONFIG (配置與語系)
// 這裡存放所有靜態文字與外掛狀態。未來要調整提示詞、
// 預設標籤或增加支援語系，請只修改這區。
// ==========================================
const CONFIG = {
    i18n: {
        "zh-TW": {
            baseCondition: "你是一個 Logseq 專家。請將內容重構成結構化的 Markdown 縮排清單（使用 - 符號）。嚴禁任何廢話或前言。絕對保留原有的 [[雙向連結]] 與 #標籤。",
            welcome: "🤖 <b>Logseq AI Bot</b> 已就緒。<br>我是你的頁面助理，你可以與我對話，或直接點擊「套用」整理本頁。",
            applyBtn: "✨ 套用 (AI-Format-Page)",
            clearBtn: "🗑️",
            placeholder: "輸入需求 (Enter 傳送 / Shift+Enter 換行)...",
            detecting: "正在偵測頁面...",
            tagDefault: "🤖 AI 重構結果",
            working: "⏳ 正在重構中...",
            done: "✅ 整理完成",
            error: "❌ API 發生錯誤: ",
            pagePrefix: "目前頁面：",
        },
        "en": {
            baseCondition: "You are a Logseq expert. Please restructure the content into a hierarchical Markdown list using '-' bullets. No preamble. Strictly preserve all [[Backlinks]] and #Tags.",
            welcome: "🤖 <b>Logseq AI Bot</b> ready.<br>I am your page assistant. Chat with me or click 'Apply' to reformat this page.",
            applyBtn: "✨ Apply (AI-Format-Page)",
            clearBtn: "🗑️",
            placeholder: "Enter needs (Enter to send / Shift+Enter for newline)...",
            detecting: "Detecting page...",
            tagDefault: "🤖 AI Refactor Result",
            working: "⏳ Refactoring...",
            done: "✅ Done",
            error: "❌ API Error: ",
            pagePrefix: "Current Page: ",
        }
    },
    state: {
        chatStore: {},          // 存放分頁對話
        currentPageUuid: null,  // 當前頁面 ID
        isBusy: false,          // 鎖定狀態
        isVisible: false,       // 顯示狀態
        tempInput: "",          // 輸入框暫存
        t: null                 // 這是當前啟用的語系包，會在 main() 初始化
    }
};

// ==========================================
// 🛠️ 模組二：邏輯引擎 (暫不更動功能，僅同步變數路徑)
// ==========================================
const ls = window.logseq;

async function writeToLogseq(aiMarkdown) {
    const { tag } = ls.settings;
    const tagText = tag || CONFIG.state.t.tagDefault; // 修改路徑
    const blockTree = aiMarkdown.split('\n').filter(l => l.trim() !== '').map(l => ({
        content: l.replace(/^\s*[-*]\s+/, '').trim()
    }));
    const blocks = await ls.Editor.getCurrentPageBlocksTree();
    const findOld = (tree) => {
        for (let b of tree) {
            if (b.content.includes(tagText)) return b;
            if (b.children) { const res = findOld(b.children); if (res) return res; }
        }
    };
    const oldBlock = findOld(blocks);
    if (oldBlock) await ls.Editor.removeBlock(oldBlock.uuid);
    const last = blocks[blocks.length - 1];
    const title = await ls.Editor.insertBlock(last.uuid, `### ${tagText}`, { sibling: true });
    await ls.Editor.insertBatchBlock(title.uuid, blockTree, { sibling: true });
}

async function syncPageContext() {
    try {
        let page = await ls.Editor.getCurrentPage();
        if (!page) return;
        if (page.page) { page = await ls.Editor.getPage(page.page.id); }
        const pageName = page.originalName || page.name;
        CONFIG.state.currentPageUuid = page.uuid; // 修改路徑
        if (!CONFIG.state.chatStore[CONFIG.state.currentPageUuid]) { // 修改路徑
            CONFIG.state.chatStore[CONFIG.state.currentPageUuid] = { name: pageName, msgs: [] };
        }
    } catch (e) { console.error(e); }
}

// ------------------------------------------
// UI 與 Actions 區塊 (後續我們會繼續拆解這一區)
// ------------------------------------------
function getChatTemplate() {
    const state = CONFIG.state; // 引用狀態
    const uuids = Object.keys(state.chatStore);
    const currentData = state.chatStore[state.currentPageUuid] || { name: state.t.detecting, msgs: [] };

    const formatMsg = (str) => {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    };

    const tabsHtml = uuids.map(uuid => `
        <div class="ai-tab ${uuid === state.currentPageUuid ? 'active' : ''}" data-on-click="switchToTab" data-proxy-id="${uuid}">
            <span>📄 ${state.chatStore[uuid].name.substring(0, 7)}</span>
            <span class="close-x" data-on-click="closeTab" data-proxy-id="${uuid}">✕</span>
        </div>
    `).join('');


    let chatHtml = currentData.msgs.length === 0
        ? `<div class="ai-msg assistant">${state.t.welcome}</div>`
        : currentData.msgs.map(m => `<div class="ai-msg ${m.role}">${formatMsg(m.content)}</div>`).join('');

    if (state.isBusy) {
        chatHtml += `<div class="ai-msg assistant"><span class="loading-dots">...</span></div>`;
    }

    return `
    <div id="ai-chat-container" style="position: fixed; top: 60px; right: 20px; width: 380px; height: 580px; background: #1a1b26; color: #a9b1d6; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); display: flex; flex-direction: column; border: 1px solid #414868; z-index: 10000; font-family: sans-serif; overflow: hidden; pointer-events: auto;">
        <style>
            #ai-tabs { display: flex; background: #16161e; overflow-x: auto; border-bottom: 1px solid #333; min-height: 35px; }
            .ai-tab { padding: 8px 12px; font-size: 11px; cursor: pointer; opacity: 0.5; border-right: 1px solid #222; white-space: nowrap; display: flex; align-items: center; }
            .ai-tab.active { opacity: 1; background: #24283b; border-bottom: 2px solid #7aa2f7; color: #7aa2f7; }
            #ai-history { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; }
            .ai-msg { padding: 8px 12px; border-radius: 8px; font-size: 13px; max-width: 85%; word-wrap: break-word; line-height: 1.4; }
            .ai-msg.user { background: #3d59a1; color: white; align-self: flex-end; }
            .ai-msg.assistant { background: #292e42; border: 1px solid #444; align-self: flex-start; }
            #ai-input-box { padding: 12px; background: #24283b; border-top: 1px solid #16161e; }
            #ai-textarea { width: 100%; background: #16161e; color: white; border: 1px solid #414868; padding: 10px; border-radius: 6px; resize: none; margin-bottom: 8px; outline: none; box-sizing: border-box; font-size: 13px; }
            .btn-row { display: flex; gap: 6px; }
            .ai-btn { padding: 10px; border-radius: 4px; border: none; cursor: pointer; font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center; }
            .btn-send { background: #7aa2f7; color: #15161e; flex: 0.2; font-size: 16px; }
            .btn-apply { background: #bb9af7; color: #15161e; flex: 0.6; }
            .btn-clear { background: #444; color: white; flex: 0.2; }
            .btn-close-win { position: absolute; top: 6px; right: 10px; background: none; color: #565f89; border: none; cursor: pointer; font-size: 16px; }
            .loading-dots { font-weight: bold; font-size: 18px; display: inline-block; animation: blink 1.4s infinite both; }
            @keyframes blink { 0% { opacity: .2; } 20% { opacity: 1; } 100% { opacity: .2; } }
        </style>
        <button class="btn-close-win" data-on-click="hidePortal">✕</button>
        <div id="ai-tabs">${tabsHtml}</div>
        <div style="padding: 10px 15px; font-size: 12px; background: #24283b; font-weight: bold;">📄 ${currentData.name}</div>
        <div id="ai-history">${chatHtml}</div>
        <div id="ai-input-box">
            <textarea id="ai-textarea" data-on-input="syncInput" data-on-keydown="handleKeydown" placeholder="${state.t.placeholder}" rows="2">${state.tempInput}</textarea>
            <div class="btn-row">
                <button class="ai-btn btn-clear" data-on-click="clearChat">${state.t.clearBtn}</button>
                <button class="ai-btn btn-apply" data-on-click="applyToPage">${state.t.applyBtn}</button>
                <button class="ai-btn btn-send" data-on-click="sendMsg">➤</button>
            </div>
        </div>
    </div>
    `;
}

const actions = {
    syncInput(e) { CONFIG.state.tempInput = e.value; },
    handleKeydown(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.sendMsg(); } },
    async togglePortal() {
        CONFIG.state.isVisible = !CONFIG.state.isVisible;
        if (CONFIG.state.isVisible) { await syncPageContext(); }
        renderUI();
    },
    hidePortal() { CONFIG.state.isVisible = false; renderUI(); },
    async switchToTab(e) {
        const uuid = e.dataset.proxyId;
        CONFIG.state.currentPageUuid = uuid;
        await ls.App.pushState('page', { name: CONFIG.state.chatStore[uuid].name });
        renderUI();
    },
    closeTab(e) {
        const uuid = e.dataset.proxyId;
        delete CONFIG.state.chatStore[uuid];
        if (CONFIG.state.currentPageUuid === uuid) CONFIG.state.currentPageUuid = Object.keys(CONFIG.state.chatStore)[0] || null;
        renderUI();
    },
    clearChat() { if (CONFIG.state.currentPageUuid) CONFIG.state.chatStore[CONFIG.state.currentPageUuid].msgs = []; renderUI(); },

    async sendMsg() {
        const state = CONFIG.state;
        if (!state.tempInput.trim() || state.isBusy || !state.currentPageUuid) return;
        const pageName = state.chatStore[state.currentPageUuid].name;
        state.isBusy = true;
        state.chatStore[state.currentPageUuid].msgs.push({ role: "user", content: state.tempInput });
        state.tempInput = ""; renderUI();
        try {
            const { apiKey, model, basePath } = ls.settings;
            const blocks = await ls.Editor.getCurrentPageBlocksTree();
            const getTxt = (tree) => tree.reduce((acc, b) => acc + b.content + '\n' + (b.children ? getTxt(b.children) : ''), '');
            const response = await fetch(`${basePath}/chat/completions`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: "system", content: `${state.t.pagePrefix}[[${pageName}]]\n` + getTxt(blocks) }, ...state.chatStore[state.currentPageUuid].msgs]
                })
            });
            const data = await response.json();
            if (data.choices && data.choices[0]) {
                state.chatStore[state.currentPageUuid].msgs.push({ role: "assistant", content: data.choices[0].message.content });
            } else { throw new Error(data.error?.message || "Invalid API response"); }
        } catch (e) { ls.UI.showMsg(state.t.error + e.message, 'error'); }
        finally { state.isBusy = false; renderUI(); }
    },

    // 在 actions 物件中找到 applyToPage
    async applyToPage() {
        const state = CONFIG.state;
        if (state.isBusy) return;

        // 1. 隱藏視窗並鎖定狀態
        state.isVisible = false;
        renderUI();
        state.isBusy = true;

        // 2. 建立心跳函式：使用你 CONFIG 裡的 working 文字 
        const showHeartbeat = () => {
            if (state.isBusy) {
                // 直接抓取 "⏳ 正在重構中..." 或 "⏳ Refactoring..."
                ls.UI.showMsg(state.t.working, 'info', { timeout: 4000 });
            }
        };

        showHeartbeat(); // 立即觸發第一次
        const heartbeatTimer = setInterval(showHeartbeat, 6000); // 每 6 秒確認一次 

        try {
            await syncPageContext();
            const { apiKey, model, basePath, advancedFormatPrompt } = ls.settings;
            const finalBasePrompt = advancedFormatPrompt?.trim() || state.t.baseCondition;
            const blocks = await ls.Editor.getCurrentPageBlocksTree();
            const getTxt = (tree) => tree.reduce((acc, b) => acc + b.content + '\n' + (b.children ? getTxt(b.children) : ''), '');

            // 核心 API 請求
            const response = await fetch(`${basePath}/chat/completions`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model, messages: [{ role: "system", content: finalBasePrompt }, { role: "user", content: getTxt(blocks) }] })
            });

            const data = await response.json();
            clearInterval(heartbeatTimer); // 拿到資料後立刻停止心跳 

            if (data.choices && data.choices[0]) {
                // 3. 寫入階段：同樣維持 working 狀態直到真正完成 
                ls.UI.showMsg(state.t.working, 'info', { timeout: 2000 });
                await writeToLogseq(data.choices[0].message.content);

                // 顯示 "✅ 整理完成" 或 "✅ Done"
                ls.UI.showMsg(state.t.done, 'success');
            } else {
                throw new Error(data.error?.message || "API 無回應");
            }
        } catch (e) {
            clearInterval(heartbeatTimer);
            ls.UI.showMsg(state.t.error + e.message, 'error'); // 顯示錯誤訊息
            state.isVisible = true;
            renderUI();
        } finally {
            state.isBusy = false;
        }
    }
};

function renderUI() {
    if (CONFIG.state.isVisible) {
        ls.provideUI({ key: 'ai-portal', path: '#app-container', template: getChatTemplate() });
        ls.setMainUIAttrs({ style: { pointerEvents: 'auto' } }); // 原本就是 auto，保留

        setTimeout(() => {
            const history = parent.document.getElementById('ai-history');
            if (history) { history.scrollTop = history.scrollHeight; }
        }, 50);
    } else {
        ls.provideUI({ key: 'ai-portal', template: '' });
    }
}

async function main() {
    const config = await ls.App.getUserConfigs();
    // 初始化 CONFIG 內的語系包
    CONFIG.state.t = (config.preferredLanguage?.startsWith("zh")) ? CONFIG.i18n["zh-TW"] : CONFIG.i18n["en"];

    ls.useSettingsSchema([
        { key: "apiKey", type: "string", title: "1. API Key", default: "" },
        { key: "model", type: "string", title: "2. Model", default: "anthropic/claude-3.5-sonnet" },
        { key: "tag", type: "string", title: "3. Tag / Header", default: CONFIG.state.t.tagDefault },
        { key: "advancedFormatPrompt", type: "string", inputAs: "textarea", title: "4. Custom Format Prompt", default: "" },
        { key: "basePath", type: "string", title: "5. API Endpoint", default: "https://openrouter.ai/api/v1" }
    ]);
    ls.provideModel(actions);
    ls.App.registerUIItem('toolbar', { key: 'ai-portal-btn', template: `<a class="button" data-on-click="togglePortal"><span style="font-size: 20px;">🤖</span></a>` });
    ls.Editor.registerSlashCommand('AI-Format-Page', actions.applyToPage);
    ls.App.onRouteChanged(async () => { if (CONFIG.state.isVisible) { await syncPageContext(); renderUI(); } });
}

ls.ready(main).catch(console.error);