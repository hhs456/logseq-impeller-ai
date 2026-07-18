// src/agent.ts
import '@logseq/libs';
import { state } from './config';
import { startBusyFeedback, stopBusyFeedback } from './engine';
import { renderUI } from './ui';
import { buildSystemPrompt } from './prompts';
import { MemoryManager } from './memory';
import { getAvailableTools, executeToolCall } from './tools';


// 在 agent 物件外部新增輔助函式
const getTxt = (tree: any[]): string => tree.reduce((acc, b) => acc + b.content + '\n' + (b.children ? getTxt(b.children) : ''), '');

async function buildPageContextPrompt(pageUuid: string): Promise<string> {
    const blocks = await logseq.Editor.getPageBlocksTree(pageUuid);
    const system = buildSystemPrompt({ langName: state.t.langName, isWritingToPage: false });
    const pageName = state.chatStore[pageUuid]?.name || "Unknown Page";
    // 統一格式
    return `${system}\n\n【Page Name】: ${pageName}\n\n【Page Content】:\n${getTxt(blocks)}`;
}

function showBackgroundCompletionMsg(pageUuid: string) {
    if (state.currentPageUuid !== pageUuid) {
        const finishedPageName = state.chatStore[pageUuid]?.name || state.t.bgPage;
        logseq.UI.showMsg(state.t.bgChatDone.replace('{name}', finishedPageName), 'success');
    }
}

export const agent = {
    stopTask() {
        if (state.abortController) state.abortController.abort();
    },

    async ask(messages: any[], useNotification = false) {
        state.isBusy = true;
        state.abortController = new AbortController();
        if (useNotification) startBusyFeedback();
        renderUI();
        let currentMessages: any[] = [...messages];
        let iterations = 0;
        // 1️⃣ 放寬限制：把 3 次提高到 7 次或 10 次，讓 Agent 有足夠的空間去翻找程式碼
         
        // 💡 1️⃣ 這裡改成動態從設定讀取 (運用 ?? 防止設定失效時報錯)
        const maxIterations: number  = logseq.settings?.maxIterations as number ?? 7;

        try {
            const { apiKey, model, basePath } = logseq.settings!;
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
                        "HTTP-Referer": "https://github.com/hhs456/logseq-impeller-ai",
                        "X-Title": "Impeller AI: Universal LLM Sidebar",
                    },
                    body: JSON.stringify(requestBody),
                    signal: state.abortController.signal
                });

                const data = await response.json();
                const message = data.choices?.[0]?.message;

                console.log(`[第 ${iterations} 次請求] 模型的回覆:`, message);

                if (!message) {
                    // 1. 在 Console 印出完整的 Object 方便除錯
                    console.error("OpenRouter 回傳異常詳細資料:", data);
                    
                    // 2. 嘗試從 OpenRouter 的標準錯誤格式中提取確切的錯誤訊息
                    const errMsg = data.error?.message || data.error || JSON.stringify(data);
                    
                    // 3. 在畫面上顯示給使用者看，避免無聲無息地失敗
                    logseq.UI.showMsg(`API 拒絕請求: ${errMsg}`, 'error');
                    return null;
                }

                if (message.tool_calls && message.tool_calls.length > 0) {
                    currentMessages.push(message);

                    for (const toolCall of message.tool_calls) {
                        try {
                            const args = JSON.parse(toolCall.function.arguments);
                            const toolResultString = await executeToolCall(toolCall.function.name, args);

                            currentMessages.push({
                                role: "tool",
                                tool_call_id: toolCall.id,
                                name: toolCall.function.name,
                                content: toolResultString
                            });
                            renderUI();
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
                    continue;
                }

                return message.content;
            }

            // 2️⃣ 防呆機制：如果迴圈跑完還是沒結果，不要 return null，而是回傳一段系統警告！
            console.warn(`[Agent] ⚠️ 已達到最大思考次數限制 (${maxIterations}次)，強制暫停以避免無窮迴圈。`);
            return `⚠️ **[系統攔截]** 思考程序已達到上限 (${maxIterations} 次)。\n這通常是因為您要求的檔案或程式碼結構太過龐大，導致我需要不斷反覆搜尋。\n\n**目前的進度已保留，請嘗試：**\n1. 縮小您的問題範圍\n2. 直接指明要查詢的特定函數或段落`;

        } catch (e: any) {
            if (e.name === 'AbortError') {
                console.log("偵測到使用者終止任務，正在保留目前的工具執行與對話歷程...");

                let abortSummary = "";

                for (const m of currentMessages) {
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
                        // 💡 修改：被強制中止後產生的報告也需要存起來
                        MemoryManager.saveHistory(state.currentPageUuid);
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

        state.chatStore[targetUuid].msgs.push({
            role: "user",
            content: state.tempInput,
            timestamp: Date.now()  // 💡 新增時間戳記
        });
        state.tempInput = "";

        await MemoryManager.compressIfNeeded(targetUuid, agent.ask.bind(this));

        const promptWithContext = await buildPageContextPrompt(targetUuid);
        const recentHistory = MemoryManager.buildApiPayload(targetUuid);

        const res = await agent.ask([
            { role: "system", content: promptWithContext },
            ...recentHistory
        ], false);

        if (res) {
            state.chatStore[targetUuid].msgs.push({ role: "assistant", content: res, timestamp: Date.now() });
            MemoryManager.saveHistory(targetUuid);
            showBackgroundCompletionMsg(targetUuid); // 共用通知
            renderUI();
        }
    },

    async regenerateMsg(e: any) {
        const msgIndex = parseInt(e.dataset.index, 10);
        const pageUuid = state.currentPageUuid;
        if (!pageUuid || state.isBusy) return;

        // 💡 1. 補上重新生成的 I18N 防呆
        if (!confirm(state.t.confirmRegenerate)) return;

        state.processingPageUuid = pageUuid;
        const msgs = state.chatStore[pageUuid].msgs;

        const userPrompt = msgs[msgIndex - 1]?.content;
        if (!userPrompt) {
            state.processingPageUuid = null;
            return;
        }

        const originalBackup = msgs.slice(msgIndex);
        state.chatStore[pageUuid].msgs = msgs.slice(0, msgIndex);

        let success = false;

        try {
            // 💡 2. 使用 buildApiPayload 來節省 Token，而不是把整坨 msgs 丟過去
            const promptWithContext = await buildPageContextPrompt(pageUuid);
            const apiPayload = MemoryManager.buildApiPayload(pageUuid, 12);

            const res = await agent.ask([
                { role: "system", content: promptWithContext },
                ...apiPayload
            ], true);

            if (res) {
                state.chatStore[pageUuid].msgs.push({ role: "assistant", content: res, timestamp: Date.now() });
                success = true;
                MemoryManager.saveHistory(pageUuid);
                showBackgroundCompletionMsg(pageUuid); // 共用通知
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
    }
};