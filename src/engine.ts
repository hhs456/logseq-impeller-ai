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

// 🎯 關鍵優化：建立一個包含分割線與換行的複合標籤文字
    // 這樣在 Logseq 渲染時會自動在該 Block 最上方畫出一條水平線，再接標籤文字
    const tagWithSeparator = `--- \n${tagText}`;

    // 1. 清理 Markdown 標籤 (保留你的原邏輯)
    const cleanMarkdown = aiMarkdown
        .replace(/```markdown/g, '')
        .replace(/```/g, '')
        .trim();
    // 2. 內部函式：將純文字 Markdown 解析成 Logseq 樹狀結構 (新邏輯，取代原本的 .map)
    const parseMarkdownToTree = (text: string) => {
        const lines = text.split('\n');
        const root: any[] = [];
        const stack: { block: any, indent: number }[] = [];

        for (const line of lines) {
            if (line.trim() === '') continue;

            const normalizedLine = line.replace(/\t/g, '    ');
            const leadingSpaces = normalizedLine.match(/^\s*/)?.[0].length || 0;
            
            const content = normalizedLine.trim().replace(/^([-*+]|\d+\.)\s+/, '');

            const newBlock = { content: content, children: [] };

            if (stack.length === 0 || leadingSpaces === 0) {
                root.push(newBlock);
                stack.length = 0; 
                stack.push({ block: newBlock, indent: leadingSpaces });
            } else {
                while (stack.length > 0 && stack[stack.length - 1].indent >= leadingSpaces) {
                    stack.pop();
                }

                if (stack.length === 0) {
                    root.push(newBlock);
                    stack.push({ block: newBlock, indent: leadingSpaces });
                } else {
                    const parent = stack[stack.length - 1].block;
                    parent.children.push(newBlock);
                    stack.push({ block: newBlock, indent: leadingSpaces });
                }
            }
        }
        return root;
    };

    // 取得解析好的樹狀陣列
    const batchBlocks = parseMarkdownToTree(cleanMarkdown);
    if (batchBlocks.length === 0) return;

    // 3. 取得頁面所有區塊並尋找舊的標籤區塊
    let blocks = await logseq.Editor.getPageBlocksTree(targetUuid);

    const findOld = (tree: any[]): any => {
        for (let b of tree) {
            // 💡 這裡依然用原本的 tagText 查水表，不管前面有沒有加 --- 都能精準命中！
            if (b.content.includes(tagText)) return b; 
            if (b.children) { 
                const res = findOld(b.children); 
                if (res) return res; 
            }
        }
    };

    // 移除舊區塊 
    const oldBlock = findOld(blocks || []);
    if (oldBlock) {
        await logseq.Editor.removeBlock(oldBlock.uuid);
        // 💡 小優化：刪除後重新抓取一次 blocks，避免剛剛刪除的剛好是最後一個區塊，導致下方報錯
        blocks = await logseq.Editor.getPageBlocksTree(targetUuid); 
    }

    // 4. 插入新區塊 
    const last = blocks[blocks.length - 1];
    
    // 如果頁面已經全空了，先建立一個基準點
    let targetBlockUuid = last?.uuid;
    if (!targetBlockUuid) {
        const initialBlock = await logseq.Editor.appendBlockInPage(targetUuid, "");
        if (initialBlock) targetBlockUuid = initialBlock.uuid;
    }

    if (targetBlockUuid) {
        // 插入你的專屬 Tag 標題
        const title = await logseq.Editor.insertBlock(targetBlockUuid, `### ${tagText}`, { sibling: true });
        
        if (title) {
            // 💡 寫入階層樹狀結構
            // 提示：希望 AI 回覆的內容是放在 `### 🤖 AI Assistant` 標題的「內部(子節點)」，
            // 可以把下面的 { sibling: true } 改成 { sibling: false }。
            // 目前維持 true，表示會與標題平行。
            await logseq.Editor.insertBatchBlock(title.uuid, batchBlocks, { sibling: true });
        }
    }
}