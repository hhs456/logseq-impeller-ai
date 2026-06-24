// src/actions.ts
import '@logseq/libs';
import { state } from './config';
import { writeToLogseq } from './engine';
import { buildSystemPrompt } from './prompts';
import { MemoryManager } from './memory';
import { agent } from './agent';

export const actions = {
    async updatePageContext() {
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
                state.chatStore[actualPage.uuid] = { name: pageName, msgs: [] };
            } else {
                state.chatStore[actualPage.uuid].name = pageName;
            }
        } else {
            state.currentPageUuid = null;
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
    }
};