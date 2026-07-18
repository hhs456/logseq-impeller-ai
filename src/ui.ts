// src/ui.ts
import '@logseq/libs';
import { state } from './config';
import { actions } from './actions';
import { agent } from './agent';
import { SIDEBAR_CSS } from './ui/styles';
import { buildHeader, buildMemorySection, buildChatHistory, buildInputArea } from './ui/components';
import { panel } from './panel';

let stylesInjected = false;

export function renderUI() {
    if (!state.isVisible) {
        logseq.provideUI({ key: 'ai-sidebar', template: '' });
        return;
    }

    if (!stylesInjected) {
        logseq.provideStyle({ key: 'ai-sidebar-styles', style: SIDEBAR_CSS });
        stylesInjected = true;
    }

    const currentData = state.currentPageUuid && state.chatStore[state.currentPageUuid]
        ? state.chatStore[state.currentPageUuid]
        : { msgs: [] };

    let busyMessage = state.t.thinking;
    if (state.isBusy && state.processingPageUuid && state.processingPageUuid !== state.currentPageUuid) {
        const processingName = state.chatStore[state.processingPageUuid]?.name || state.t.bgPage;
        busyMessage = state.t.processingOther.replace('{name}', processingName);
    }

    // 🔍 尋找大樓（最外層容器）是否已經蓋好了
    const containerEl = parent.document.getElementById('ai-sidebar-container');

    if (!containerEl) {
        // --------------------------------------------------------
        // 🏗️ 階段 A：初次渲染 (核彈級大重建，只有第一次打開才會執行)
        // --------------------------------------------------------
        const template = `
            <div id="ai-sidebar-container" style="display: flex; flex-direction: column; ${state.isCollapsed ? 'height: auto;' : 'height: calc(100vh - 100px); min-height: 400px;'} box-sizing: border-box; padding: 10px;">
                <div style="display: flex; flex-direction: column; ${state.isCollapsed ? '' : 'height: 100%;'} background: var(--ls-primary-background-color); border: 1px solid var(--ls-border-color); border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                    
                    <div id="ai-sidebar-header-wrapper">${buildHeader(state.isCollapsed, state.t.aiBtnText)}</div>
                    
                    <div id="ai-sidebar-body-wrapper" style="display: ${state.isCollapsed ? 'none' : 'flex'}; flex-direction: column; flex: 1; overflow: hidden;">
                        
                        <div id="ai-sidebar-memory-wrapper">${buildMemorySection(state.isMemoryCollapsed)}</div>
                        
                        <!-- 📦 將歷史對話用 wrapper 包起來，這是待會要進行局部替換的「目標圖層」 -->
                        <div id="ai-sidebar-history-wrapper" style="flex: 1; overflow: hidden; display: flex; flex-direction: column;">
                            ${buildChatHistory(currentData.msgs, state.isBusy, busyMessage, state.t.welcome)}
                        </div>
                        
                        <!-- 📦 輸入框圖層，生出來之後就絕對不再用 innerHTML 摧毀它 -->
                        <div id="ai-sidebar-input-wrapper">${buildInputArea(state.t.placeholder, state.isBusy)}</div>
                        
                    </div>
                </div>
            </div>
        `;

        logseq.provideUI({ key: 'ai-sidebar', path: '#right-sidebar .sidebar-item-list', template });

        // 第一次蓋好大樓，延遲綁定事件與計算高度
        setTimeout(() => {
            const historyEl = parent.document.getElementById('ai-sidebar-history');
            if (historyEl) historyEl.scrollTop = historyEl.scrollHeight;
            setupStaticEventListeners();
        }, 100);

    } else {
        // --------------------------------------------------------
        // 🛠️ 階段 B：PRO 級局部差分更新 (DOM Diffing，無閃爍、不掉焦點)
        // --------------------------------------------------------
        
        const bodyWrapper = parent.document.getElementById('ai-sidebar-body-wrapper');
        if (bodyWrapper) bodyWrapper.style.display = state.isCollapsed ? 'none' : 'flex';

        // 1. 更新 Header 與 Memory
        const headerWrapper = parent.document.getElementById('ai-sidebar-header-wrapper');
        if (headerWrapper) headerWrapper.innerHTML = buildHeader(state.isCollapsed, state.t.aiBtnText);

        const memoryWrapper = parent.document.getElementById('ai-sidebar-memory-wrapper');
        if (memoryWrapper) memoryWrapper.innerHTML = buildMemorySection(state.isMemoryCollapsed);

        // 2. 核心滾動防禦：先記錄現在的位置
        const historyElBefore = parent.document.getElementById('ai-sidebar-history');
        let shouldScrollToBottom = true;
        let savedScrollTop = 0;
        if (historyElBefore) {
            const threshold = 50;
            shouldScrollToBottom = (historyElBefore.scrollHeight - historyElBefore.scrollTop - historyElBefore.clientHeight) <= threshold;
            savedScrollTop = historyElBefore.scrollTop;
        }

        // 3. 瞬間抽換對話內容 (因為外層 DOM 沒死，滾動條不會跳回 0)
        const historyWrapper = parent.document.getElementById('ai-sidebar-history-wrapper');
        if (historyWrapper) {
            historyWrapper.innerHTML = buildChatHistory(currentData.msgs, state.isBusy, busyMessage, state.t.welcome);
            
            // ⚡ 因為是局部替換，瀏覽器會在同一毫秒內瞬間算好高度，我們可以直接無延遲強制對齊，做到 0 閃爍！
            const historyElAfter = parent.document.getElementById('ai-sidebar-history');
            if (historyElAfter) {
                if (shouldScrollToBottom) {
                    historyElAfter.scrollTop = historyElAfter.scrollHeight;
                } else {
                    historyElAfter.scrollTop = savedScrollTop;
                }
                
                // 由於舊的歷史 DOM 剛剛被我們抽換掉了，雙鏈點擊事件必須重新掛載給新的 DOM
                historyElAfter.onclick = async (e: any) => {
                    const wikiLink = e.target.closest('a[data-on-click="openPage"]');
                    const pageLink = e.target.closest('.ai-chat-page-link');
                    const targetEl = wikiLink || pageLink;
                    if (targetEl) {
                        e.preventDefault();
                        e.stopPropagation(); 
                        await actions.openPage({ dataset: { pageName: targetEl.getAttribute('data-page-name') } });
                    }
                };
            }
        }

        // 4. 🔒 終極焦點防護：只切換 readonly
        const textarea = parent.document.getElementById('ai-sidebar-textarea') as HTMLTextAreaElement;
        if (textarea) {
            // 用 readonly 取代 disabled
            textarea.readOnly = state.isBusy;
            textarea.style.opacity = state.isBusy ? '0.5' : '1';
            textarea.style.cursor = state.isBusy ? 'not-allowed' : 'text';
            
            if (textarea.value !== state.tempInput) {
                textarea.value = state.tempInput;
            }
            if (!state.isBusy) {
                setTimeout(() => {
                    textarea.focus();
                    // 👑 絕招：強制重繪文字游標！就算 Chromium 卡住，這行指令也會逼它把游標畫在文字最末端
                    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
                }, 50);
            }
        }

        // 5. 動態修改送出按鈕的狀態與文字
        const sendBtn = parent.document.querySelector('#ai-sidebar-input-wrapper button:last-child') as HTMLButtonElement;
        if (sendBtn) {
            if (state.isBusy) {
                sendBtn.innerHTML = '🛑 Stop';
                sendBtn.setAttribute('data-on-click', 'stopTask');
                sendBtn.style.background = 'var(--ls-error-background-color, #ff4d4f)';
                sendBtn.style.color = 'white';
            } else {
                sendBtn.innerHTML = '➤ Send';
                sendBtn.setAttribute('data-on-click', 'sendMsg');
                sendBtn.style.background = 'var(--ls-quaternary-background-color)';
                sendBtn.style.color = '';
            }
        }
    }
}

// 🎯 這個函數的生命週期中只會被呼叫「一次」，徹底根絕多重定時器與事件打架的問題
// 🎯 將底部的事件綁定替換為「永生代理模式」
function setupStaticEventListeners() {
    const textarea = parent.document.getElementById('ai-sidebar-textarea') as HTMLTextAreaElement;
    if (textarea) {
        textarea.value = state.tempInput;
        textarea.oninput = (e: any) => { state.tempInput = e.target.value; };
        textarea.onkeydown = (e) => {
            if (["ArrowUp", "ArrowDown", "Enter"].includes(e.key)) e.stopPropagation();
            if (e.key === "Enter" && !e.shiftKey && !state.isBusy) {
                e.preventDefault(); 
                const sendBtn = parent.document.querySelector('[data-on-click="sendMsg"]') as HTMLElement;
                if (sendBtn) sendBtn.click();
            }
        };
        if (!state.isBusy) {
            setTimeout(() => {
                textarea.focus();
                // 👑 絕招：強制重繪文字游標
                textarea.setSelectionRange(textarea.value.length, textarea.value.length);
            }, 50);
        }
    }

    // 🛡️ 核心防禦：綁定在絕對不會被 innerHTML 摧毀的 ai-sidebar-history-wrapper 上
    const historyWrapper = parent.document.getElementById('ai-sidebar-history-wrapper');
    if (historyWrapper) {
        historyWrapper.onclick = async (e: any) => {
            // 1. 攔截雙鏈跳轉
            const wikiLink = e.target.closest('a[data-on-click="openPage"], .ai-chat-page-link');
            if (wikiLink) {
                e.preventDefault(); 
                e.stopPropagation(); 
                await actions.openPage({ dataset: { pageName: wikiLink.getAttribute('data-page-name') } });
                return; // 執行完就中斷
            }

            // 2. 攔截所有被 Logseq 遺棄的動作按鈕 (Delete, Copy, Retry)
            const actionBtn = e.target.closest('.ai-action-link');
            if (actionBtn) {
                e.preventDefault(); 
                e.stopPropagation();
                
                const actionType = actionBtn.getAttribute('data-on-click');
                const index = actionBtn.getAttribute('data-index');
                const payload = { dataset: { index } };

                // ⚡ 自己的按鈕自己路由，不靠 Logseq 系統
                if (actionType === 'deleteMsg') await panel.deleteMsg(payload);
                if (actionType === 'copyMsg') await panel.copyMsg(payload);
                if (actionType === 'regenerateMsg') await agent.regenerateMsg(payload);
            }
        };
    }
}