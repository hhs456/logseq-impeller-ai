// src/actions.ts
import '@logseq/libs';
import { state } from './config';
import { startBusyFeedback, stopBusyFeedback, writeToLogseq } from './engine';
import { renderUI } from './ui';
import { buildSystemPrompt } from './prompts';
import { MemoryManager } from './memory';

// 💡 1. 改為匯入全新的工具註冊與分派中心
import { getAvailableTools, executeToolCall } from './tools';

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

    async callAI(messages: any[], useNotification = false) {
        state.isBusy = true;
        state.abortController = new AbortController();
        if (useNotification) startBusyFeedback();
        renderUI();
        let currentMessages: any[] = [...messages];
        let iterations = 0;
        const maxIterations = 3;

        try {
            const { apiKey, model, basePath } = logseq.settings!;

            // 💡 2. 移除寫死的工具清單，改用模組化的註冊中心
            const tools = getAvailableTools();

            while (iterations < maxIterations) {
                const requestBody: any = { model, messages: currentMessages };

                if (tools) {
                    requestBody.tools = tools;
                    requestBody.tool_choice = "auto";
                }

                console.log(`[第 ${iterations} 次請求] 準備發送給模型 (${model}):`, requestBody);

                const response = await fetch(`${basePath}/chat/completions`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://github.com/hhs456/logseq-impeller-ai", // 填寫 GitHub 項目網址或本地 localhost
                        "X-Title": "Impeller AI: Universal LLM Sidebar", // 填寫在 OpenRouter 後台顯示的 App 名稱
                    },
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
                        try {
                            const args = JSON.parse(toolCall.function.arguments);

                            // 💡 3. 一行程式碼！動態分發任何工具 (web_search, semantic_search, graph_tag_search)
                            const toolResultString = await executeToolCall(toolCall.function.name, args);

                            currentMessages.push({
                                role: "tool",
                                tool_call_id: toolCall.id,
                                name: toolCall.function.name,
                                content: toolResultString
                            });
                            renderUI(); // 工具執行完可以刷一下 UI
                        } catch (err) {
                            currentMessages.push({
                                role: "tool",
                                tool_call_id: toolCall.id,
                                name: toolCall.function.name,
                                content: JSON.stringify({ error: "工具執行失敗或參數解析錯誤" })
                            });
                        }
                    }
                    iterations++;
                    continue; // 跑完工具後，繼續下一個迴圈讓 AI 判斷是否還有需要查的
                }

                return message.content;
            }

            return null;

        } catch (e: any) {
            if (e.name === 'AbortError') {
                console.log("偵測到使用者終止任務，正在保留目前的工具執行與對話歷程...");

                let abortSummary = "";

                for (const m of currentMessages) {
                    // 💡 4. 讓中止歷程也能動態顯示不同的工具名稱與關鍵字
                    if (m.role === 'assistant' && m.tool_calls) {
                        for (const tc of m.tool_calls) {
                            try {
                                const args = JSON.parse(tc.function.arguments);
                                const q = args.query || args.target_page || "執行中";
                                abortSummary += `🛠️ *[系統] 觸發工具 (${tc.function.name})： "${q}"...*\n`;
                            } catch {
                                abortSummary += `🛠️ *[系統] 觸發工具 (${tc.function.name})...*\n`;
                            }
                        }
                    }
                    if (m.role === 'tool') {
                        abortSummary += `✅ *[系統] 工具執行完成，已取得資料。*\n`;
                    }
                }

                abortSummary += `\n🛑 **[對話已被使用者終止]**`;

                if (!state.processingPageUuid && state.currentPageUuid) {
                    const currentData = state.chatStore[state.currentPageUuid];
                    if (currentData) {
                        currentData.msgs.push({ role: "assistant", content: abortSummary });
                        if (typeof (this as any).saveChatStore === 'function') {
                            (this as any).saveChatStore();
                        }
                    }
                }

                logseq.UI.showMsg(state.t.aborted, 'warning');
                return abortSummary;
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

        const userQuery = state.tempInput;

        state.chatStore[targetUuid].msgs.push({ role: "user", content: state.tempInput });
        state.tempInput = "";

        await MemoryManager.compressIfNeeded(targetUuid, this.callAI.bind(this));

        const blocks = await logseq.Editor.getPageBlocksTree(targetUuid);
        const getTxt = (tree: any[]): string => tree.reduce((acc, b) => acc + b.content + '\n' + (b.children ? getTxt(b.children) : ''), '');

        const system = buildSystemPrompt({ langName: state.t.langName, isWritingToPage: false });
        const pageName = state.chatStore[targetUuid]?.name || "Unknown Page";

        // 💡 5. 移除這裡寫死的 RAG 向量搜尋。現在我們只給 AI 當前頁面內容，
        // 如果 AI 覺得資訊不夠，它會「自己」呼叫工具去全域搜尋！
        const promptWithContext = `${system}\n\n【Page Name】: ${pageName}\n\n【Page Content】:\n${getTxt(blocks)}`;

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
                await window.parent.navigator.clipboard.writeText(msg.content);
                logseq.UI.showMsg('✅ 已複製對話內容', 'success');
            } catch (err) {
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

        state.chatStore[pageUuid].msgs = state.chatStore[pageUuid].msgs.slice(0, msgIndex);
        logseq.UI.showMsg('🗑️ 已刪除該訊息及後續對話', 'info');
        renderUI();
    },

    async regenerateMsg(e: any) {
        const msgIndex = parseInt(e.dataset.index, 10);
        const pageUuid = state.currentPageUuid;
        if (!pageUuid || state.isBusy) return;

        state.processingPageUuid = pageUuid;
        const msgs = state.chatStore[pageUuid].msgs;

        const userPrompt = msgs[msgIndex - 1]?.content;
        if (!userPrompt) {
            state.processingPageUuid = null;
            return;
        }

        const originalBackup = msgs.slice(msgIndex);
        state.chatStore[pageUuid].msgs = msgs.slice(0, msgIndex);

        const blocks = await logseq.Editor.getPageBlocksTree(pageUuid);
        const getTxt = (tree: any[]): string => tree.reduce((acc, b) => acc + b.content + '\n' + (b.children ? getTxt(b.children) : ''), '');

        const promptWithContext = `${buildSystemPrompt({ langName: state.t.langName, isWritingToPage: false })}\n\n【Page Name】: ${state.chatStore[pageUuid].name}\n\n【Content】:\n${getTxt(blocks)}`;

        let success = false;

        try {
            const res = await this.callAI([
                { role: "system", content: promptWithContext },
                ...state.chatStore[pageUuid].msgs
            ], true);

            if (res) {
                state.chatStore[pageUuid].msgs.push({ role: "assistant", content: res });
                success = true;

                if (state.currentPageUuid !== pageUuid) {
                    const finishedPageName = state.chatStore[pageUuid]?.name || state.t.bgPage;
                    logseq.UI.showMsg(state.t.bgChatDone.replace('{name}', finishedPageName), 'success');
                }
            }
        } catch (err) {
            console.error("重新生成失敗:", err);
        } finally {
            if (!success) {
                state.chatStore[pageUuid].msgs = state.chatStore[pageUuid].msgs.slice(0, msgIndex);
                state.chatStore[pageUuid].msgs.push(...originalBackup);
            }
            renderUI();
        }
    },

    async formatPage() {
        if (state.isBusy || !state.currentPageUuid) return;

        const targetUuid = state.currentPageUuid;
        state.processingPageUuid = targetUuid;
        const chatHistory = state.chatStore[targetUuid]?.msgs || [];

        const blocks = await logseq.Editor.getPageBlocksTree(targetUuid);
        const getTxt = (tree: any[]): string => tree.reduce((acc, b) => acc + b.content + '\n' + (b.children ? getTxt(b.children) : ''), '');
        const originalContent = getTxt(blocks);

        if (!originalContent.trim()) {
            logseq.UI.showMsg("頁面目前沒有內容可以排版喔！", 'warning');
            state.processingPageUuid = null;
            return;
        }

        let instruction = chatHistory.length === 0 ? state.t.applyReformat : state.t.applyContext;

        const system = buildSystemPrompt({
            langName: state.t.langName,
            isWritingToPage: true,
            baseCondition: state.t.baseCondition,
            instruction: instruction
        });

        const pageName = state.chatStore[targetUuid]?.name || "Unknown Page";
        const recentHistory = MemoryManager.getRecentHistory(targetUuid);

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
    },
    
    async exportChat() {
        const targetUuid = state.currentPageUuid;
        if (!targetUuid || !state.chatStore[targetUuid] || state.chatStore[targetUuid].msgs.length === 0) {
            // 💡 1. 替換為 i18n 變數
            logseq.UI.showMsg(state.t.exportNoChat || "目前沒有對話可以匯出喔！", 'warning');
            return;
        }

        const chat = state.chatStore[targetUuid];
        const markdownContent = `# AI Chat: ${chat.name}\n\n` + chat.msgs.map(m => {
            const roleStr = m.role as string;
            const roleName = roleStr === 'user' ? '🧑 **You**' : (roleStr === 'tool' ? '🛠️ **System**' : '🤖 **AI**');
            return `${roleName}:\n${m.content}`;
        }).join('\n\n---\n\n');

        const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = window.parent.document.createElement('a'); 
        a.href = url;
        a.download = `Impeller_Chat_${chat.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}.md`;
        a.click();
        URL.revokeObjectURL(url);

        // 💡 2. 替換為 i18n 變數，並動態載入頁面名稱
        const successMsg = (state.t.exportSuccess || `✅ 已匯出對話：{name}`).replace('{name}', chat.name);
        logseq.UI.showMsg(successMsg, 'success');
    },
};