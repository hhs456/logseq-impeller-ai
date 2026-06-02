// src/actions.ts
import '@logseq/libs';
import { state } from './config';
import { startBusyFeedback, stopBusyFeedback, writeToLogseq } from './engine';
import { renderUI } from './ui';
// 💡 1. 這裡匯入剛剛做好的 tools.ts
import { executeWebSearch } from './tools';
import { buildSystemPrompt } from './prompts';

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

        try {
            const { apiKey, model, basePath, webApiKey } = logseq.settings!;

            // 定義要告訴 AI 的技能清單 (有填金鑰才會送出)
            const tools = webApiKey ? [
                {
                    type: "function",
                    function: {
                        name: "web_search",
                        // 💡 讓他知道「只要是近期的事，就絕對不能靠記憶」
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

            let currentMessages = [...messages];
            let iterations = 0;
            const maxIterations = 3;

            while (iterations < maxIterations) {
                const requestBody: any = { model, messages: currentMessages };

                if (tools) {
                    requestBody.tools = tools;
                    requestBody.tool_choice = "auto"; // 💡 明確告訴模型：你可以自己決定要不要用工具
                }

                // 🔍 監視器 1：確認送出的資料到底長怎樣
                console.log(`[第 ${iterations} 次請求] 準備發送給模型 (${model}):`, requestBody);

                const response = await fetch(`${basePath}/chat/completions`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify(requestBody),
                    signal: state.abortController.signal
                });

                const data = await response.json();
                const message = data.choices?.[0]?.message;

                // 🔍 監視器 2：確認 OpenRouter 到底回傳了什麼鬼東西
                console.log(`[第 ${iterations} 次請求] 模型的回覆:`, message);

                if (!message) {
                    console.error("OpenRouter 回傳異常:", data); // 看看是不是 API 報錯了
                    return null;
                }

                // 檢查 AI 是否發出了使用工具的請求
                if (message.tool_calls && message.tool_calls.length > 0) {
                    currentMessages.push(message); // 紀錄 AI 的請求

                    for (const toolCall of message.tool_calls) {
                        if (toolCall.function.name === 'web_search') {
                            try {
                                const args = JSON.parse(toolCall.function.arguments);

                                // 💡 3. 這裡就是實際呼叫你 tools.ts 程式碼的地方！
                                const searchResult = await executeWebSearch(args.query);

                                currentMessages.push({
                                    role: "tool",
                                    tool_call_id: toolCall.id,
                                    name: toolCall.function.name,
                                    content: searchResult
                                });
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
                    continue; // 資料拿到了，重新把對話丟給 AI 整理答案
                }

                return message.content;
            }

            return null;

        } catch (e: any) {
            if (e.name === 'AbortError') {
                logseq.UI.showMsg(state.t.aborted, 'warning');
            } else {
                logseq.UI.showMsg(state.t.error + e.message, 'error');
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
        if (!state.tempInput.trim() || state.isBusy || !state.currentPageUuid) return;
        
        const targetUuid = state.currentPageUuid; 
        state.processingPageUuid = targetUuid; 

        state.chatStore[targetUuid].msgs.push({ role: "user", content: state.tempInput });
        state.tempInput = "";
        
        const blocks = await logseq.Editor.getPageBlocksTree(targetUuid);
        const getTxt = (tree: any[]): string => tree.reduce((acc, b) => acc + b.content + '\n' + (b.children ? getTxt(b.children) : ''), '');
        
        const system = buildSystemPrompt({
            langName: state.t.langName,
            isWritingToPage: false
        });
        
        // 🎯 真正的修復：從狀態庫拿出正確的頁面名稱（檔名）
        const pageName = state.chatStore[targetUuid]?.name || "Unknown Page";
        
        // 🎯 將檔名與內文一起組合，讓 AI 清楚知道自己在哪個檔案裡！
        const promptWithContext = `${system}\n\n【Page Name (File Name)】: ${pageName}\n\n【Page Content】:\n${getTxt(blocks)}`;
        
        const res = await this.callAI([{ role: "system", content: promptWithContext }, ...state.chatStore[targetUuid].msgs], false);

        if (res) {
            state.chatStore[targetUuid].msgs.push({ role: "assistant", content: res });

            if (state.currentPageUuid !== targetUuid) {
                const finishedPageName = state.chatStore[targetUuid]?.name || state.t.bgPage;
                logseq.UI.showMsg(state.t.bgChatDone.replace('{name}', finishedPageName), 'success');
            }
            renderUI();
        }
    },

async applyToPage() {
        if (state.isBusy || !state.currentPageUuid) return;

        const targetUuid = state.currentPageUuid;
        state.processingPageUuid = targetUuid;
        const chatHistory = state.chatStore[targetUuid]?.msgs || [];

        const blocks = await logseq.Editor.getPageBlocksTree(targetUuid);
        const getTxt = (tree: any[]): string => tree.reduce((acc, b) => acc + b.content + '\n' + (b.children ? getTxt(b.children) : ''), '');

        let instruction = chatHistory.length === 0 ? state.t.applyReformat : state.t.applyContext;

        const system = buildSystemPrompt({
            langName: state.t.langName,
            isWritingToPage: true,
            baseCondition: state.t.baseCondition,
            instruction: instruction
        });

        // 🎯 同樣在這裡加入 Page Name
        const pageName = state.chatStore[targetUuid]?.name || "Unknown Page";

        const res = await this.callAI([
            { role: "system", content: system },
            // 🎯 明確告訴 AI 檔名是什麼
            { role: "user", content: `【Page Name】: ${pageName}\n\n【Original Page Content】:\n${getTxt(blocks)}` },
            ...chatHistory,
            { role: "user", content: "Execute mission and output results in Markdown now." }
        ], true);

       if (res) {
            console.log("AI 產生的原始 Markdown：\n", res); 
            await writeToLogseq(res, targetUuid);
            logseq.UI.showMsg(state.t.done, 'success');
        }
    }
};