// src/actions.ts
import '@logseq/libs';
import { state } from './config';
import { writeToLogseq } from './engine';
import { buildSystemPrompt } from './prompts';
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
        const newFingerprint = await MemoryManager.getGraphPrefix();
        console.log("[Actions] 偵測到 Logseq 圖表切換，正在進行記憶庫沙盒隔離...");
        console.log("[Actions] 當前圖表指紋:", newFingerprint);

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
                // 將內容反向解碼
                const decodedCode = decodeURIComponent(rawCode);

                // 優先使用 parent 的剪貼簿 API，因為 parent 主視窗才擁有系統焦點
                try {
                    await window.parent.navigator.clipboard.writeText(decodedCode);
                    logseq.UI.showMsg('✅ 程式碼已複製至剪貼簿！', 'success');
                } catch (err) {
                    // Fallback 降級處理 (建立隱藏的 textarea 並使用 execCommand 強制複製)
                    const textArea = window.parent.document.createElement("textarea");
                    textArea.value = decodedCode;
                    textArea.style.position = "fixed";
                    textArea.style.opacity = "0";

                    window.parent.document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();

                    try {
                        const successful = window.parent.document.execCommand('copy');
                        window.parent.document.body.removeChild(textArea);

                        if (successful) {
                            logseq.UI.showMsg('✅ 程式碼已複製至剪貼簿！(降級模式)', 'success');
                        } else {
                            throw new Error('execCommand returned false');
                        }
                    } catch (fallbackErr) {
                        window.parent.document.body.removeChild(textArea);
                        console.error('複製程式碼完全失敗:', err, fallbackErr);
                        logseq.UI.showMsg('❌ 複製失敗，剪貼簿遭到系統底層封鎖', 'error');
                    }
                }
            } catch (err) {
                console.error('Decode failed:', err);
                logseq.UI.showMsg('❌ 解碼失敗', 'error');
            }
        }
    },
    openPage: async (e: any) => {
        // 從我們上面設定的 data-page-name 取得頁面名稱
        const pageName = e.dataset.pageName;

        if (pageName) {
            // 利用 Logseq API 執行頁面跳轉
            await logseq.App.pushState('page', { name: pageName });
        }
    },
};