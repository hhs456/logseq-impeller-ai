// src/actions.ts
import '@logseq/libs';
import { state } from './config';
import { startBusyFeedback, stopBusyFeedback, writeToLogseq } from './engine';
import { renderUI } from './ui';

export const actions = {
    async updatePageContext() {
        // 先用一個明確的 local 變數接收，此時它是 PageEntity | BlockEntity | null
        let currentPage: any = await logseq.Editor.getCurrentPage();
        
        if (currentPage) {
            // 💡 解決錯誤 1：檢查 'page' 是否存在於物件中，並用 Type Assertion 告訴 TS 它有 id
            if ('page' in currentPage && currentPage.page) {
                const pageRef = currentPage.page as { id: number };
                
                // 💡 解決錯誤 2：使用獨立變數 actualPage 承接，不直接覆蓋，確保 currentPage 絕不為 null
                const actualPage = await logseq.Editor.getPage(pageRef.id);
                if (actualPage) {
                    currentPage = actualPage;
                }
            }

            state.currentPageUuid = currentPage.uuid;
            
            // 💡 解決錯誤 3：確保有備用字串，並使用 as string 強制符合 types.ts 的嚴格規範
            const pageName = (currentPage.originalName || currentPage.name || "Untitled") as string;
            
            if (!state.chatStore[currentPage.uuid]) {
                state.chatStore[currentPage.uuid] = { name: pageName, msgs: [] };
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
        
        try {
            const { apiKey, model, basePath } = logseq.settings!;
            const response = await fetch(`${basePath}/chat/completions`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model, messages }),
                signal: state.abortController.signal
            });
            const data = await response.json();
            return data.choices?.[0]?.message?.content;
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
        const system = `Respond ALWAYS in ${state.t.langName}.\nCurrent Page:\n${getTxt(blocks)}`;
        
        const res = await this.callAI([{ role: "system", content: system }, ...state.chatStore[targetUuid].msgs], false);
        
        if (res) {
            state.chatStore[targetUuid].msgs.push({ role: "assistant", content: res });
            
            if (state.currentPageUuid !== targetUuid) {
                const pageName = state.chatStore[targetUuid]?.name || state.t.bgPage;
                logseq.UI.showMsg(state.t.bgChatDone.replace('{name}', pageName), 'success');
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
        const system = `Respond ALWAYS in ${state.t.langName}.\n${state.t.baseCondition}\n${instruction}`;

        const res = await this.callAI([
            { role: "system", content: system },
            { role: "user", content: `Original Page Content:\n${getTxt(blocks)}` },
            ...chatHistory,
            { role: "user", content: "Execute mission and output results in Markdown now." }
        ], true);

        if (res) { 
            await writeToLogseq(res, targetUuid); 
            logseq.UI.showMsg(state.t.done, 'success'); 
        }
    }
};