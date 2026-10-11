// src/actions.ts
import '@logseq/libs';
import { state } from './config';
import { copyToClipboard } from './utils/clipboard';
import { getStaticPromptParts } from './prompts';
import { MemoryManager } from './memory';
import { renderUI } from './ui';
import { logger } from './utils/logger';
import { getGraphKind } from './graph/kind';
import { pageDisplayName } from './graph/text';

let isCopying = false;

export const actions = {
    // 💡 3b：每次進入 ++contextGen；每個 await 後檢查世代號，過期即 return（切頁 race）
    async updatePageContext() {
        const gen = ++state.contextGen;

        const currentGraph = await logseq.App.getCurrentGraph();
        if (gen !== state.contextGen) return;
        const newGraphPath = currentGraph ? currentGraph.path : 'default';

        // 🔒 如果發現圖表路徑跟當前 state 存的不一樣，說明發生了隱式切換，立刻洗掉記憶體
        if (state.currentGraphPath && state.currentGraphPath !== newGraphPath) {
            state.chatStore = {};
            state.drafts = {};
            state.tempInput = '';
            MemoryManager.invalidateMemoryIndex();
        }
        state.currentGraphPath = newGraphPath;

        let entity: any = await logseq.Editor.getCurrentPage();
        if (gen !== state.contextGen) return;
        if (!entity) {
            entity = await logseq.Editor.getCurrentBlock();
            if (gen !== state.contextGen) return;
        }
        if (!entity) {
            state.currentPageUuid = null;
            return;
        }

        let actualPage: any = null;
        if (entity.uuid) {
            const checkBlock = await logseq.Editor.getBlock(entity.uuid);
            if (gen !== state.contextGen) return;
            if (checkBlock && checkBlock.page && checkBlock.page.id) {
                actualPage = await logseq.Editor.getPage(checkBlock.page.id);
                if (gen !== state.contextGen) return;
            } else {
                actualPage = await logseq.Editor.getPage(entity.uuid) || entity;
            }
        }

        if (actualPage) {
            const prevUuid = state.currentPageUuid;
            state.currentPageUuid = actualPage.uuid;
            const kind = await getGraphKind();
            if (gen !== state.contextGen) return;
            // 修 H：DB 無 originalName → title 優先；file 逐字等價現行
            const pageName = (pageDisplayName(actualPage, kind) || "Untitled") as string;

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

            // 3b：切頁時載入該頁草稿
            if (prevUuid !== actualPage.uuid) {
                state.tempInput = state.drafts[actualPage.uuid] ?? '';
            }
        } else {
            state.currentPageUuid = null;
        }
    },

    // 💡 3b：專門處理主動切換圖表事件。比較實體路徑，進行中先 abort 再清快取
    async handleGraphChange() {
        const currentGraph = await logseq.App.getCurrentGraph();
        const newPath = currentGraph ? currentGraph.path : 'default';

        if (state.currentGraphPath === newPath) return;

        logger.info("[Actions] 偵測到圖表變更，執行徹底重置...");

        // 1. 若有進行中的 run，先中止，避免回調寫入即將被清的 chatStore（N6）
        if (state.run) {
            state.run.controller.abort();
            state.run = null;
            state.isBusy = false;
            state.processingPageUuid = null;
        }

        // 2. 徹底洗掉舊圖表在 RAM 的快取與草稿
        state.chatStore = {};
        state.drafts = {};
        state.tempInput = '';
        state.currentPageUuid = null;
        state.currentGraphPath = newPath;
        MemoryManager.invalidateMemoryIndex();

        // 3. 重新載入新圖表的上下文並刷新 UI
        await actions.updatePageContext();
        renderUI();
    },

    // 複製程式碼：字串由 events 管線從同層 .ai-code-block code 的 textContent 讀取
    copyCode: async (code: string) => {
        if (!code) return;
        try {
            await copyToClipboard(code, '✅ 程式碼已複製至剪貼簿！');
        } catch (err) {
            logger.error('Copy failed:', err);
            logseq.UI.showMsg('❌ 複製失敗', 'error');
        }
    },
    openPage: async (pageName: string) => {
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
            // DB 以 uuid 路由（redirect-to-page! 建議 uuid，Q3/N15）；file 維持原始大小寫名
            const kind = await getGraphKind();
            await logseq.App.pushState('page', { name: kind === 'db' ? page.uuid : pageName });
            
        } catch (err) {
            logger.error('導航至頁面失敗:', err);
            logseq.UI.showMsg('❌ 無法跳轉至該頁面', 'error');
        }
    },

    async resetSettings() {
        if (!confirm(state.t.resetSettingsConfirm)) return;
        logseq.updateSettings({
            apiKey: "",
            model: "openai/gpt-4o-mini",
            basePath: "https://openrouter.ai/api/v1",
            temperature: 0.7,
            maxIterations: 7,
            systemPromptOverride: getStaticPromptParts(state.t.langName).join('\n\n'),
            reasoningEffort: "",
            enableSemanticSearch: true,
            enableWebSearch: false,
            enableStreaming: true,
            webApiKey: "",
        });
        logseq.UI.showMsg(state.t.resetSettingsDone, 'success');
    },
};