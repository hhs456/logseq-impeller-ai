// src/engine.ts
import '@logseq/libs';
import { state } from './config';

export function startBusyFeedback() {
    if (state.timer) clearInterval(state.timer);
    logseq.UI.showMsg(state.t.working, 'info');
    state.timer = setInterval(() => {
        if (state.isBusy) logseq.UI.showMsg(state.t.working, 'info');
    }, 4000);
}

export function stopBusyFeedback() {
    if (state.timer) { 
        clearInterval(state.timer); 
        state.timer = null; 
    }
}

export async function writeToLogseq(aiMarkdown: string, targetUuid: string) {
    const { tag } = logseq.settings!;
    const tagText = tag || state.t.tagDefault;

    const cleanMarkdown = aiMarkdown
        .replace(/```markdown/g, '')
        .replace(/```/g, '')
        .trim();

    const blockTree = cleanMarkdown.split('\n')
        .filter(l => l.trim() !== '')
        .map(l => ({
            content: l.replace(/^\s*[-*]\s+/, '').trim()
        }));

    const blocks = await logseq.Editor.getPageBlocksTree(targetUuid);

    const findOld = (tree: any[]): any => {
        for (let b of tree) {
            if (b.content.includes(tagText)) return b;
            if (b.children) { 
                const res = findOld(b.children); 
                if (res) return res; 
            }
        }
    };

    const oldBlock = findOld(blocks || []);
    if (oldBlock) await logseq.Editor.removeBlock(oldBlock.uuid);

    const last = blocks[blocks.length - 1];
    if (last) {
        const title = await logseq.Editor.insertBlock(last.uuid, `### ${tagText}`, { sibling: true });
        if (title) {
            await logseq.Editor.insertBatchBlock(title.uuid, blockTree, { sibling: true });
        }
    }
}