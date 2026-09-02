// src/agent.ts
import '@logseq/libs';
import { state } from './config';
import { startBusyFeedback, stopBusyFeedback } from './engine';
import { renderUI } from './ui';
import { buildSystemPrompt } from './prompts';
import { MemoryManager } from './memory';
import { getAvailableTools, executeToolCall } from './tools';
import { getTxt } from './utils/markdown';

// ─────────────────────────────────────────────
// 【最佳化 1】：常數集中管理，避免魔術數字散落各處
// ─────────────────────────────────────────────
const DEFAULT_MAX_ITERATIONS = 7;
const REGENERATE_HISTORY_LIMIT = 12;

const MAX_PAGE_CHARS = 12000;

async function buildPageContextPrompt(pageUuid: string): Promise<string> {
    const blocks = await logseq.Editor.getPageBlocksTree(pageUuid);
    const system = buildSystemPrompt({ langName: state.t.langName, isWritingToPage: false });
    const pageName = state.chatStore[pageUuid]?.name ?? "Unknown Page";

    let pageContent = getTxt(blocks);

    // 若頁面內容超出上限，截斷並附上提示，避免 Token 爆炸
    if (pageContent.length > MAX_PAGE_CHARS) {
        pageContent =
            pageContent.slice(0, MAX_PAGE_CHARS) +
            `\n\n... [⚠️ 頁面內容過長，已自動截斷，僅保留前 ${MAX_PAGE_CHARS} 字元]`;
    }

    return `${system}\n\n【Page Name】: ${pageName}\n\n【Page Content】:\n${pageContent}`;
}

// ─────────────────────────────────────────────
// 【維持原有】：背景頁面完成通知
// ─────────────────────────────────────────────
function showBackgroundCompletionMsg(pageUuid: string) {
    if (state.currentPageUuid !== pageUuid) {
        const finishedPageName = state.chatStore[pageUuid]?.name ?? state.t.bgPage;
        logseq.UI.showMsg(state.t.bgChatDone.replace('{name}', finishedPageName), 'success');
    }
}

// ─────────────────────────────────────────────
// 【最佳化 4】：工具呼叫處理獨立為函式，降低 ask() 複雜度
// ─────────────────────────────────────────────
async function handleToolCall(toolCall: any): Promise<any> {
    try {
        const args = JSON.parse(toolCall.function.arguments);
        const toolResultString = await executeToolCall(toolCall.function.name, args);
        return {
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: toolResultString,
        };
    } catch {
        return {
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: JSON.stringify({ error: "工具執行失敗或參數解析錯誤" }),
        };
    }
}

// ─────────────────────────────────────────────
// 【最佳化 5】：中止時的摘要報告獨立為函式，降低 catch 區塊複雜度
// ─────────────────────────────────────────────
function buildAbortSummary(currentMessages: any[]): string {
    let summary = "";
    for (const m of currentMessages) {
        if (m.role === 'assistant' && m.tool_calls) {
            for (const tc of m.tool_calls) {
                try {
                    const args = JSON.parse(tc.function.arguments);
                    const q = args.query ?? args.target_page ?? "執行中";
                    summary += `🛠️ *[系統] 觸發工具 (${tc.function.name})： "${q}"...*\n`;
                } catch {
                    summary += `🛠️ *[系統] 觸發工具 (${tc.function.name})...*\n`;
                }
            }
        }
        if (m.role === 'tool') {
            summary += `✅ *[系統] 工具執行完成，已取得資料。*\n`;
        }
    }
    summary += `\n🛑 **[對話已被使用者終止]**`;
    return summary;
}

// ─────────────────────────────────────────────
// 主要 agent 物件
// ─────────────────────────────────────────────
export const agent = {

    stopTask() {
        state.abortController?.abort();
    },

    async ask(messages: any[], useNotification = false): Promise<string | null> {
        state.isBusy = true;
        const previousAbortController = state.abortController;
        state.abortController = new AbortController();
        if (useNotification) startBusyFeedback();
        renderUI();

        let currentMessages: any[] = [...messages];
        let iterations = 0;

        // 【最佳化 6】：從設定動態讀取，並以常數作 fallback，防止設定失效
        const maxIterations: number =
            (logseq.settings?.maxIterations as number) ?? DEFAULT_MAX_ITERATIONS;
        const temperature: number =
            (logseq.settings?.temperature as number) ?? 0.7;
        const reasoningEffort: string =
            ((logseq.settings?.reasoningEffort as string) ?? "").trim().toLowerCase();

        try {
            const { apiKey, model, basePath } = logseq.settings!;
            const tools = getAvailableTools();

            while (iterations < maxIterations) {
                const requestBody: any = { model, messages: currentMessages, temperature };
                if (reasoningEffort) {
                    requestBody.reasoning_effort = reasoningEffort;
                }

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
                    signal: state.abortController.signal,
                });

                const data = await response.json();
                const message = data.choices?.[0]?.message;

                console.log(`[第 ${iterations} 次請求] 模型的回覆:`, message);

                if (!message) {
                    console.error("OpenRouter 回傳異常詳細資料:", data);
                    const errMsg = data.error?.message ?? data.error ?? JSON.stringify(data);
                    logseq.UI.showMsg(`API 拒絕請求: ${errMsg}`, 'error');
                    return null;
                }

                // 模型要求使用工具
                if (message.tool_calls?.length > 0) {
                    currentMessages.push(message);

                    // 【最佳化 7】：工具呼叫改為平行執行，加速多工具情境
                    const toolResults = await Promise.all(
                        message.tool_calls.map((tc: any) => handleToolCall(tc))
                    );
                    currentMessages.push(...toolResults);

                    // 【最佳化 8】：工具執行完畢後立即刷新 UI，提升即時回饋感
                    renderUI();
                    iterations++;
                    continue;
                }

                // 模型回傳最終文字答案，直接返回
                return message.content;
            }

            // 【維持原有】：防呆攔截，達到最大迭代次數時的友善提示
            console.warn(`[Agent] ⚠️ 已達到最大思考次數限制 (${maxIterations}次)，強制暫停以避免無窮迴圈。`);
            return (
                `⚠️ **[系統攔截]** 思考程序已達到上限 (${maxIterations} 次)。\n` +
                `這通常是因為您要求的檔案或程式碼結構太過龐大，導致我需要不斷反覆搜尋。\n\n` +
                `**目前的進度已保留，請嘗試：**\n` +
                `1. 縮小您的問題範圍\n` +
                `2. 直接指明要查詢的特定函數或段落`
            );

        } catch (e: any) {
            if (e.name === 'AbortError') {
                console.log("偵測到使用者終止任務，正在保留目前的工具執行與對話歷程...");

                // 【最佳化 5】：摘要報告由獨立函式產生
                const abortSummary = buildAbortSummary(currentMessages);

                if (!state.processingPageUuid && state.currentPageUuid) {
                    const currentData = state.chatStore[state.currentPageUuid];
                    if (currentData) {
                        currentData.msgs.push({ role: "assistant", content: abortSummary });
                        MemoryManager.saveHistory(state.currentPageUuid);
                    }
                }

                logseq.UI.showMsg(state.t.aborted, 'warning');
                return abortSummary;
            }

            logseq.UI.showMsg(state.t.error + e.message, 'error');
            return null;

        } finally {
            state.isBusy = false;
            state.abortController = previousAbortController;
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
            timestamp: Date.now(),
        });
        state.tempInput = "";

        await MemoryManager.compressIfNeeded(targetUuid, agent.ask.bind(agent));

        const promptWithContext = await buildPageContextPrompt(targetUuid);
        const recentHistory = MemoryManager.buildApiPayload(targetUuid);

        const res = await agent.ask([
            { role: "system", content: promptWithContext },
            ...recentHistory,
        ]);

        if (res) {
            state.chatStore[targetUuid].msgs.push({
                role: "assistant",
                content: res,
                timestamp: Date.now(),
            });
            MemoryManager.saveHistory(targetUuid);
            showBackgroundCompletionMsg(targetUuid);
            renderUI();
        }
    },

    async regenerateMsg(e: any) {
        const msgIndex = parseInt(e.dataset.index, 10);
        const pageUuid = state.currentPageUuid;
        if (!pageUuid || state.isBusy) return;
        if (!confirm(state.t.confirmRegenerate)) return;

        state.processingPageUuid = pageUuid;
        const msgs = state.chatStore[pageUuid].msgs;

        const userPrompt = msgs[msgIndex - 1]?.content;
        if (!userPrompt) {
            state.processingPageUuid = null;
            return;
        }

        // 備份原有訊息，以防重新生成失敗時還原
        const originalBackup = msgs.slice(msgIndex);
        state.chatStore[pageUuid].msgs = msgs.slice(0, msgIndex);

        let success = false;

        try {
            const promptWithContext = await buildPageContextPrompt(pageUuid);

            // 【最佳化 9】：使用常數取代硬編碼的 12，與 sendMsg 行為統一
            const apiPayload = MemoryManager.buildApiPayload(pageUuid, REGENERATE_HISTORY_LIMIT);

            const res = await agent.ask(
                [{ role: "system", content: promptWithContext }, ...apiPayload],
                true
            );

            if (res) {
                state.chatStore[pageUuid].msgs.push({
                    role: "assistant",
                    content: res,
                    timestamp: Date.now(),
                });
                success = true;
                MemoryManager.saveHistory(pageUuid);
                showBackgroundCompletionMsg(pageUuid);
            }
        } catch (err) {
            console.error("重新生成失敗:", err);
        } finally {
            if (!success) {
                // 還原至備份
                state.chatStore[pageUuid].msgs = [
                    ...state.chatStore[pageUuid].msgs.slice(0, msgIndex),
                    ...originalBackup,
                ];
            }
            renderUI();
        }
    },
};