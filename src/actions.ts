// src/actions.ts
import '@logseq/libs';
import { state } from './config';
import { startBusyFeedback, stopBusyFeedback, writeToLogseq } from './engine';
import { renderUI } from './ui';
// 💡 1. 這裡匯入剛剛做好的 tools.ts
import { executeWebSearch } from './tools';
import { buildSystemPrompt } from './prompts';
import { MemoryManager } from './memory';

export const actions = {
    async updatePageContext() {
        // 1. 先嘗試抓取當前頁面或區塊
        let entity: any = await logseq.Editor.getCurrentPage();

        if (!entity) {
            entity = await logseq.Editor.getCurrentBlock();
        }

        if (!entity) {
            state.currentPageUuid = null;
            return;
        }

        let actualPage: any = null;

        // 🎯 終極解法：用 UUID 查水表，破解 Logseq 的「偽裝頁面」
        if (entity.uuid) {
            // 直接去 Block 資料庫查這個 UUID
            const checkBlock = await logseq.Editor.getBlock(entity.uuid);

            // 如果查出來它真的是一個 Block，而且有指向真實的 Page
            if (checkBlock && checkBlock.page && checkBlock.page.id) {
                actualPage = await logseq.Editor.getPage(checkBlock.page.id);
            } else {
                // 如果在 Block 庫查不到，代表它是貨真價實的 Page (檔名)
                actualPage = await logseq.Editor.getPage(entity.uuid) || entity;
            }
        }

        // 2. 處理真正找到的「實體頁面」
        if (actualPage) {
            state.currentPageUuid = actualPage.uuid;

            // 這時候拿到的 originalName 絕對會是真正的檔名 (例如: 2026-06-03 或 我的筆記)
            const pageName = (actualPage.originalName || actualPage.name || "Untitled") as string;

            if (!state.chatStore[actualPage.uuid]) {
                state.chatStore[actualPage.uuid] = { name: pageName, msgs: [] };
            } else {
                state.chatStore[actualPage.uuid].name = pageName;
            }
        } else {
            state.currentPageUuid = null;
        }
    },
    async togglePortal() {
        state.isVisible = !state.isVisible;
        if (state.isVisible) {
            await this.updatePageContext();
            await logseq.App.setRightSidebarVisible(true);
            setTimeout(() => renderUI(), 150);
        } else {
            renderUI();
        }
    },

    toggleCollapse() {
        state.isCollapsed = !state.isCollapsed;
        renderUI();
    },

    hidePortal() {
        state.isVisible = false;
        renderUI();
    },

    clearChat() {
        if (state.currentPageUuid && state.chatStore[state.currentPageUuid]) {
            state.chatStore[state.currentPageUuid].msgs = [];
        }
        renderUI();
    },

    stopTask() {
        if (state.abortController) state.abortController.abort();
    },

    // 💡 2. 這裡原本是單向請求，現在改成了可以處理 Tool Calling 的迴圈
    async callAI(messages: any[], useNotification = false) {
        state.isBusy = true;
        state.abortController = new AbortController();
        if (useNotification) startBusyFeedback();
        renderUI();
        let currentMessages: any[] = [...messages];
        let iterations = 0;
        const maxIterations = 3;

        try {
            const { apiKey, model, basePath, webApiKey } = logseq.settings!;

            // 定義要告訴 AI 的技能清單 (有填金鑰才會送出)
            const tools = webApiKey ? [
                {
                    type: "function",
                    function: {
                        name: "web_search",
                        description: "MUST use this tool for ANY queries about current events, recent news, real-time data, dates, or if your internal knowledge might be outdated. Do not answer from memory for current facts.",
                        parameters: {
                            type: "object",
                            properties: {
                                query: { type: "string", description: "The search query or keywords." }
                            },
                            required: ["query"]
                        }
                    }
                }
            ] : undefined;

            while (iterations < maxIterations) {
                const requestBody: any = { model, messages: currentMessages };

                if (tools) {
                    requestBody.tools = tools;
                    requestBody.tool_choice = "auto";
                }

                console.log(`[第 ${iterations} 次請求] 準備發送給模型 (${model}):`, requestBody);

                const response = await fetch(`${basePath}/chat/completions`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify(requestBody),
                    signal: state.abortController.signal
                });

                const data = await response.json();
                const message = data.choices?.[0]?.message;

                console.log(`[第 ${iterations} 次請求] 模型的回覆:`, message);

                if (!message) {
                    console.error("OpenRouter 回傳異常:", data);
                    return null;
                }

                if (message.tool_calls && message.tool_calls.length > 0) {
                    currentMessages.push(message);

                    for (const toolCall of message.tool_calls) {
                        if (toolCall.function.name === 'web_search') {
                            try {
                                const args = JSON.parse(toolCall.function.arguments);
                                const searchResult = await executeWebSearch(args.query);

                                currentMessages.push({
                                    role: "tool",
                                    tool_call_id: toolCall.id,
                                    name: toolCall.function.name,
                                    content: searchResult
                                });
                                renderUI(); // 工具執行完可以刷一下 UI（或你有自己的 busy 回饋）
                            } catch (err) {
                                currentMessages.push({
                                    role: "tool",
                                    tool_call_id: toolCall.id,
                                    name: toolCall.function.name,
                                    content: JSON.stringify({ error: "搜尋執行失敗或參數解析錯誤" })
                                });
                            }
                        }
                    }
                    iterations++;
                    continue;
                }

                return message.content;
            }

            return null;

        } catch (e: any) {
            if (e.name === 'AbortError') {
                console.log("偵測到使用者終止任務，正在保留目前的工具執行與對話歷程...");

                // 🎯 2. 此時 catch 已經可以完美存取 currentMessages
                let abortSummary = "";

                for (const m of currentMessages) {
                    if (m.role === 'assistant' && m.tool_calls) {
                        for (const tc of m.tool_calls) {
                            if (tc.function?.name === 'web_search') {
                                try {
                                    const q = JSON.parse(tc.function.arguments).query;
                                    abortSummary += `🔍 *[系統] 觸發網路搜尋： "${q}"...*\n`;
                                } catch {
                                    abortSummary += `🔍 *[系統] 觸發網路搜尋...*\n`;
                                }
                            }
                        }
                    }
                    if (m.role === 'tool') {
                        abortSummary += `✅ *[系統] 搜尋完成，已取得參考資料。*\n`;
                    }
                }

                // 串上終止提示
                abortSummary += `\n🛑 **[對話已被使用者終止]**`;

                // 🎯 3. 安全鎖：如果是 Format 頁面 (有填 processingPageUuid) 則不污染對話歷史
                if (!state.processingPageUuid && state.currentPageUuid) {
                    const currentData = state.chatStore[state.currentPageUuid];
                    if (currentData) {
                        currentData.msgs.push({ role: "assistant", content: abortSummary });
                        // 如果你在 actions.ts 裡有 saveChatStore()，就在這裡存檔
                        if (typeof (this as any).saveChatStore === 'function') {
                            (this as any).saveChatStore();
                        }
                    }
                }

                logseq.UI.showMsg(state.t.aborted, 'warning');
                return abortSummary; // 回傳這段軌跡，讓對話框渲染出來
            } else {
                logseq.UI.showMsg(state.t.error + e.message, 'error');
                return null;
            }
        } finally {
            state.isBusy = false;
            state.abortController = null;
            state.processingPageUuid = null;
            if (useNotification) stopBusyFeedback();
            renderUI();
        }
    },

    async sendMsg() {
        if (!state.tempInput.trim() || state.isBusy || !state.currentPageUuid) return;

        const targetUuid = state.currentPageUuid;
        state.processingPageUuid = targetUuid;

        state.chatStore[targetUuid].msgs.push({ role: "user", content: state.tempInput });
        state.tempInput = "";

        // ✨ 新增：在發送前自動壓縮過長的記憶
        await MemoryManager.compressIfNeeded(targetUuid, this.callAI.bind(this));

        const blocks = await logseq.Editor.getPageBlocksTree(targetUuid);
        const getTxt = (tree: any[]): string => tree.reduce((acc, b) => acc + b.content + '\n' + (b.children ? getTxt(b.children) : ''), '');

        const system = buildSystemPrompt({ langName: state.t.langName, isWritingToPage: false });
        const pageName = state.chatStore[targetUuid]?.name || "Unknown Page";
        const promptWithContext = `${system}\n\n【Page Name】: ${pageName}\n\n【Page Content】:\n${getTxt(blocks)}`;

        // ✨ 新增：只抓取最新的歷史記錄，防止 Context Overflow
        const recentHistory = MemoryManager.getRecentHistory(targetUuid);

        const res = await this.callAI([
            { role: "system", content: promptWithContext },
            ...recentHistory
        ], false);

        if (res) {
            state.chatStore[targetUuid].msgs.push({ role: "assistant", content: res });

            if (state.currentPageUuid !== targetUuid) {
                const finishedPageName = state.chatStore[targetUuid]?.name || state.t.bgPage;
                logseq.UI.showMsg(state.t.bgChatDone.replace('{name}', finishedPageName), 'success');
            }
            renderUI();
        }
    },

    async copyMsg(e: any) {
        const msgIndex = parseInt(e.dataset.index, 10);
        const pageUuid = state.currentPageUuid;

        if (!pageUuid) return;

        const msg = state.chatStore[pageUuid]?.msgs[msgIndex];

        if (msg && msg.content) {
            try {
                // 🎯 關鍵修復 1：加上 parent，直接呼叫 Logseq 主視窗的剪貼簿 API
                await window.parent.navigator.clipboard.writeText(msg.content);
                logseq.UI.showMsg('✅ 已複製對話內容', 'success');
            } catch (err) {
                // 🎯 關鍵修復 2：降級方案也要把 textarea 塞進 parent.document 裡
                const textArea = window.parent.document.createElement("textarea");
                textArea.value = msg.content;

                textArea.style.position = "fixed";
                textArea.style.opacity = "0";

                window.parent.document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();

                try {
                    const successful = window.parent.document.execCommand('copy');
                    window.parent.document.body.removeChild(textArea);

                    if (successful) {
                        logseq.UI.showMsg('✅ 已複製對話內容 (降級模式)', 'success');
                    } else {
                        throw new Error('execCommand returned false');
                    }
                } catch (fallbackErr) {
                    window.parent.document.body.removeChild(textArea);
                    console.error('複製完全失敗:', err, fallbackErr);
                    logseq.UI.showMsg('❌ 複製失敗，剪貼簿遭到系統底層封鎖', 'error');
                }
            }
        }
    },
    async deleteMsg(e: any) {
        const msgIndex = parseInt(e.dataset.index, 10);
        const pageUuid = state.currentPageUuid;

        if (!pageUuid || !state.chatStore[pageUuid]) return;

        // 確認刪除邏輯：刪除該索引及之後所有的對話
        // 這樣能保證對話上下文的連續性，避免 AI 對著不存在的對話回應
        state.chatStore[pageUuid].msgs = state.chatStore[pageUuid].msgs.slice(0, msgIndex);

        logseq.UI.showMsg('🗑️ 已刪除該訊息及後續對話', 'info');
        renderUI();
    },
async regenerateMsg(e: any) {
        const msgIndex = parseInt(e.dataset.index, 10);
        const pageUuid = state.currentPageUuid;
        if (!pageUuid || state.isBusy) return;

        // 🎯 關鍵修復：補上這一行！告訴全域目前正在為哪一個頁面後台構思，UI 才能正確顯示「正在為 XXX 構思」
        state.processingPageUuid = pageUuid;

        const msgs = state.chatStore[pageUuid].msgs;
        
        // 1. 取得該 AI 回應對應的 User Prompt (索引在 msgIndex - 1)
        const userPrompt = msgs[msgIndex - 1]?.content;
        if (!userPrompt) {
            state.processingPageUuid = null; // 安全鎖：防呆重設
            return;
        }

        // 將「原本的舊 AI 回應」及之後的內容暫時抽出來備份
        const originalBackup = msgs.slice(msgIndex);

        // 2. 讓全域歷史暫時只保留到 User Prompt 這一步，並以此發送給 AI
        state.chatStore[pageUuid].msgs = msgs.slice(0, msgIndex);
        
        // 重新組合 PromptWithContext
        const blocks = await logseq.Editor.getPageBlocksTree(pageUuid);
        const getTxt = (tree: any[]): string => tree.reduce((acc, b) => acc + b.content + '\n' + (b.children ? getTxt(b.children) : ''), '');
        
        const promptWithContext = `${buildSystemPrompt({ langName: state.t.langName, isWritingToPage: false })}\n\n【Page Name】: ${state.chatStore[pageUuid].name}\n\n【Content】:\n${getTxt(blocks)}`;
        
        let success = false;

        try {
            // 3. 執行呼叫
            const res = await this.callAI([
                { role: "system", content: promptWithContext }, 
                ...state.chatStore[pageUuid].msgs
            ], true);

            // 4. 如果成功拿到新回應，覆蓋全域並標記成功
            if (res) {
                state.chatStore[pageUuid].msgs.push({ role: "assistant", content: res });
                success = true;

                // 如果完成時使用者已經切換到其他頁面，跳出成功通知
                if (state.currentPageUuid !== pageUuid) {
                    const finishedPageName = state.chatStore[pageUuid]?.name || state.t.bgPage;
                    logseq.UI.showMsg(state.t.bgChatDone.replace('{name}', finishedPageName), 'success');
                }
            }
        } catch (err) {
            console.error("重新生成失敗:", err);
        } finally {
            // 5. 判斷是否需要還原舊內容
            if (!success) {
                // 如果被中止或失敗了，移除 callAI 塞進去的中止訊息
                state.chatStore[pageUuid].msgs = state.chatStore[pageUuid].msgs.slice(0, msgIndex);
                
                // 把原本完全沒被污染、沒被修改的舊內容原封不動插回去
                state.chatStore[pageUuid].msgs.push(...originalBackup);
            }
            // 註：state.processingPageUuid 會在 callAI 的 finally 區塊被自動清空，這裡不需重複手動重設
            renderUI();
        }
    },
async formatPage() {
        if (state.isBusy || !state.currentPageUuid) return;

        const targetUuid = state.currentPageUuid;
        state.processingPageUuid = targetUuid;
        const chatHistory = state.chatStore[targetUuid]?.msgs || [];

        // 取得頁面內容
        const blocks = await logseq.Editor.getPageBlocksTree(targetUuid);
        const getTxt = (tree: any[]): string => tree.reduce((acc, b) => acc + b.content + '\n' + (b.children ? getTxt(b.children) : ''), '');
        const originalContent = getTxt(blocks);

        // 🛡️ 防呆機制：全空不處理
        if (!originalContent.trim()) {
            logseq.UI.showMsg("頁面目前沒有內容可以排版喔！", 'warning');
            state.processingPageUuid = null;
            return;
        }

        let instruction = chatHistory.length === 0 ? state.t.applyReformat : state.t.applyContext;

        // 💡 這裡會自動套用在 prompts.ts 寫好的「縮排」與「雙向連結」規則
        const system = buildSystemPrompt({
            langName: state.t.langName,
            isWritingToPage: true, 
            baseCondition: state.t.baseCondition,
            instruction: instruction
        });

        const pageName = state.chatStore[targetUuid]?.name || "Unknown Page";
        
        // 🛡️ 套用記憶管理
        const recentHistory = MemoryManager.getRecentHistory(targetUuid);

        // 送出請求
        const res = await this.callAI([
            { role: "system", content: system },
            ...recentHistory,
            { 
                role: "user", 
                content: `【Page Name】: ${pageName}\n\n【Original Page Content】:\n${originalContent}\n\n===\nExecute mission based on the context above and output the formatted results now.` 
            }
        ], true);

        if (res && typeof res === 'string') {
            console.log("AI 產生的原始 Markdown：\n", res);
            await writeToLogseq(res, targetUuid);
            logseq.UI.showMsg(state.t.done, 'success');
        }
    }
};