// src/actions.ts
import '@logseq/libs';
import { state } from './config';
import { writeToLogseq } from './engine';
import { getTxt } from './utils/markdown';
import { copyToClipboard } from './utils/clipboard';
import { buildSystemPrompt, getStaticPromptParts } from './prompts';
import { MemoryManager } from './memory';
import { agent } from './agent';
import { renderUI } from './ui';

let isCopying = false;

export const actions = {
    // 💡 1. 修正原有的 updatePageContext，每次執行都確保圖表路徑最新
    async updatePageContext() {
        const currentGraph = await logseq.App.getCurrentGraph();
        const newGraphPath = currentGraph ? currentGraph.path : 'default';

        // 🔒 如果發現圖表路徑跟當前 state 存的不一樣，說明發生了隱式切換，立刻洗掉記憶體
        if (state.currentGraphPath && state.currentGraphPath !== newGraphPath) {
            state.chatStore = {};
        }
        state.currentGraphPath = newGraphPath;

        let entity: any = await logseq.Editor.getCurrentPage();
        if (!entity) {
            entity = await logseq.Editor.getCurrentBlock();
        }
        if (!entity) {
            state.currentPageUuid = null;
            return;
        }

        let actualPage: any = null;
        if (entity.uuid) {
            const checkBlock = await logseq.Editor.getBlock(entity.uuid);
            if (checkBlock && checkBlock.page && checkBlock.page.id) {
                actualPage = await logseq.Editor.getPage(checkBlock.page.id);
            } else {
                actualPage = await logseq.Editor.getPage(entity.uuid) || entity;
            }
        }

        if (actualPage) {
            state.currentPageUuid = actualPage.uuid;
            const pageName = (actualPage.originalName || actualPage.name || "Untitled") as string;

            if (!state.chatStore[actualPage.uuid]) {
                const savedChat = MemoryManager.loadHistory(actualPage.uuid);
                if (savedChat && Array.isArray(savedChat.msgs)) {
                    state.chatStore[actualPage.uuid] = savedChat;
                } else {
                    state.chatStore[actualPage.uuid] = { name: pageName, msgs: [] };
                }
            } else {
                state.chatStore[actualPage.uuid].name = pageName;
            }
        } else {
            state.currentPageUuid = null;
        }
    },

    // 💡 2. 新增：專門處理主動切換圖表事件的監聽回呼
    async handleGraphChange() {
        const newFingerprint = MemoryManager.getGraphPrefix();
        console.log("[Actions] Graph switch detected, sandboxing memory...");
        console.log("[Actions] Current graph fingerprint:", newFingerprint);

        // 💡 核心修正：即便 path 字串不同，只要指紋計算結果不同，就觸發強制重置
        if (state.currentGraphPath !== newFingerprint) {
            console.log("[Actions] 偵測到圖表指紋變更，執行徹底重置...");

            // 1. 徹底洗掉舊圖表在記憶體（RAM）中的快取，防止殘留帶到新圖表
            state.chatStore = {};
            state.currentPageUuid = null;

            // 2. 重新讀取新圖表路徑
            const currentGraph = await logseq.App.getCurrentGraph();
            state.currentGraphPath = currentGraph ? currentGraph.path : 'default';

            // 3. 從硬碟重新載入所有該圖表的對話資料
            await MemoryManager.getAllSavedPages();

            // 3. 嘗試刷新當前頁面上下文並重新渲染 UI
            await this.updatePageContext();
            renderUI();
        }
    },

    async formatPage() {
        if (state.isBusy || !state.currentPageUuid) return;

        const targetUuid = state.currentPageUuid;
        state.processingPageUuid = targetUuid;
        const chatHistory = state.chatStore[targetUuid]?.msgs || [];

        const blocks = await logseq.Editor.getPageBlocksTree(targetUuid);
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
        const recentHistory = MemoryManager.buildApiPayload(targetUuid);

        // 💡 呼叫 llm 大腦發送任務
        const res = await agent.ask([
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

    // 新增/修改：複製程式碼的方法 (修復 Iframe 焦點與跨域限制)
    copyCode: async (e: any) => {
        const rawCode = e.dataset.code;
        if (rawCode) {
            try {
                const decodedCode = decodeURIComponent(rawCode);
                await copyToClipboard(decodedCode, '✅ 程式碼已複製至剪貼簿！');
            } catch (err) {
                console.error('Decode failed:', err);
                logseq.UI.showMsg('❌ 解碼失敗', 'error');
            }
        }
    },
    openPage: async (e: any) => {
        const pageName = e?.dataset?.pageName;
        if (!pageName) return;

        try {
            // 🔍 核心安全防禦：先檢查頁面是否存在
            const page = await logseq.Editor.getPage(pageName);
            
            if (!page) {
                // 🛑 攔截！不讓 Logseq 自動建立垃圾空白頁
                logseq.UI.showMsg(`⚠️ 頁面 [[${pageName}]] 還沒有被建立喔！`, 'warning');
                return;
            }

            // ✅ 存在才執行官方跳轉
            await logseq.App.pushState('page', { name: pageName });
            
        } catch (err) {
            console.error('導航至頁面失敗:', err);
            logseq.UI.showMsg('❌ 無法跳轉至該頁面', 'error');
        }
    },

    async resetSettings() {
        if (!confirm(state.t.resetSettingsConfirm)) return;
        logseq.updateSettings({
            apiKey: "",
            model: "openai/gpt-4o-mini",
            basePath: "https://openrouter.ai/api/v1",
            tag: state.t.tagDefault,
            temperature: 0.7,
            maxIterations: 7,
            systemPromptOverride: getStaticPromptParts(state.t.langName).join('\n\n'),
            reasoningEffort: "",
            enableSemanticSearch: true,
            enableWebSearch: false,
            webApiKey: "",
        });
        logseq.UI.showMsg(state.t.resetSettingsDone, 'success');
    },
};