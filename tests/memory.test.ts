// tests/memory.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installLogseqMock } from './helpers/logseq-mock';
import { state, I18N } from '../src/config';
import { MemoryManager } from '../src/memory';
import { obfuscate } from '../src/utils/obfuscate';

const GRAPH = 'D:/graphs/test-graph';

function chatValue(name: string, msgCount: number) {
    const msgs = [];
    for (let i = 0; i < msgCount; i++) {
        msgs.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `msg ${i} for ${name}`, timestamp: 1000 + i });
    }
    return obfuscate(JSON.stringify({ name, msgs }));
}

beforeEach(() => {
    installLogseqMock();
    state.t = I18N['en'];
    state.lang = 'en';
    state.currentGraphPath = GRAPH;
    state.chatStore = {};
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('P4: 索引快取（驗收 #8 前置）', () => {
    it('50×30 冷啟動後，第二次 getAllSavedPages 的 JSON.parse 次數為 0', () => {
        const prefix = MemoryManager.getGraphPrefix();
        for (let p = 0; p < 50; p++) {
            localStorage.setItem(prefix + 'uuid-' + p, chatValue('Page ' + p, 30));
        }
        MemoryManager.invalidateMemoryIndex();

        const parseSpy = vi.spyOn(JSON, 'parse');
        const first = MemoryManager.getAllSavedPages();
        expect(first.length).toBe(50);
        const coldParses = parseSpy.mock.calls.length;
        expect(coldParses).toBeGreaterThan(0);

        parseSpy.mockClear();
        const second = MemoryManager.getAllSavedPages();
        expect(second.length).toBe(50);
        expect(parseSpy.mock.calls.length).toBe(0);
    });

    it('N8：一筆壞資料只跳過該筆，其餘 49 筆仍回傳', () => {
        const prefix = MemoryManager.getGraphPrefix();
        for (let p = 0; p < 49; p++) {
            localStorage.setItem(prefix + 'uuid-' + p, chatValue('Page ' + p, 3));
        }
        localStorage.setItem(prefix + 'bad-uuid', '{{{ not valid json');
        MemoryManager.invalidateMemoryIndex();

        const pages = MemoryManager.getAllSavedPages();
        expect(pages.length).toBe(49);
        expect(pages.find(p => p.uuid === 'bad-uuid')).toBeUndefined();
    });

    it('其他圖譜 prefix 的 key 不會出現在結果中', () => {
        const prefix = MemoryManager.getGraphPrefix();
        localStorage.setItem(prefix + 'mine', chatValue('Mine', 2));
        localStorage.setItem('impeller_chat_SOME_OTHER_GRAPH_uuid_mine', chatValue('Foreign', 2));
        MemoryManager.invalidateMemoryIndex();

        const pages = MemoryManager.getAllSavedPages();
        expect(pages.map(p => p.name)).toEqual(['Mine']);
    });

    it('index key 不以 impeller_chat_ 開頭（N8）', () => {
        const key = MemoryManager.getIndexKey();
        expect(key.startsWith('impeller_chat_')).toBe(false);
        expect(key.startsWith('impeller_idx_')).toBe(true);
    });
});

describe('P4: buildApiPayload 只輸出 {role, content}（N7）', () => {
    it('剝除 timestamp / trace', () => {
        state.chatStore['p1'] = {
            name: 'P1',
            msgs: [
                { role: 'user', content: 'a', timestamp: 123 },
                { role: 'assistant', content: 'b', timestamp: 456 },
            ],
        };
        const payload = MemoryManager.buildApiPayload('p1');
        expect(payload).toEqual([
            { role: 'user', content: 'a' },
            { role: 'assistant', content: 'b' },
        ]);
        for (const m of payload) {
            expect(Object.keys(m).sort()).toEqual(['content', 'role']);
        }
    });
});

describe('P4: purgeOtherGraphChats（D8）', () => {
    it('只刪非當前 prefix 的 impeller_chat_ key，保留當前與非 chat key', () => {
        const prefix = MemoryManager.getGraphPrefix();
        localStorage.setItem(prefix + 'keep', chatValue('Keep', 2));
        localStorage.setItem('impeller_chat_FOREIGN_g1', chatValue('Foreign', 2));
        localStorage.setItem('impeller_idx_SOMETHING', 'x');
        localStorage.setItem('unrelated_key', 'y');

        const removed = MemoryManager.purgeOtherGraphChats();
        expect(removed).toBe(1);
        expect(localStorage.getItem(prefix + 'keep')).not.toBeNull();
        expect(localStorage.getItem('impeller_chat_FOREIGN_g1')).toBeNull();
        expect(localStorage.getItem('impeller_idx_SOMETHING')).not.toBeNull();
        expect(localStorage.getItem('unrelated_key')).not.toBeNull();
    });
});

describe('P4/V6: 量測（記錄用，不作為失敗依據）', () => {
    it('50×30 冷掃描 vs 熱快取；30 訊息 render memoize 前後', async () => {
        const prefix = MemoryManager.getGraphPrefix();
        for (let p = 0; p < 50; p++) localStorage.setItem(prefix + 'uuid-' + p, chatValue('Page ' + p, 30));
        MemoryManager.invalidateMemoryIndex();

        const t0 = performance.now();
        MemoryManager.getAllSavedPages();
        const cold = performance.now() - t0;

        const t1 = performance.now();
        MemoryManager.getAllSavedPages();
        const warm = performance.now() - t1;

        state.currentPageUuid = 'uuid-0';
        state.chatStore['uuid-0'] = MemoryManager.loadHistory('uuid-0');

        const { renderMarkdown, clearMarkdownCache } = await import('../src/utils/markdown');
        const msgs = state.chatStore['uuid-0'].msgs.map((m: any) => ({ ...m }));

        clearMarkdownCache();
        const t2 = performance.now();
        for (let i = 0; i < 10; i++) for (const m of msgs) renderMarkdown(m.content);
        const uncached = performance.now() - t2;

        const t3 = performance.now();
        for (let i = 0; i < 10; i++) for (const m of msgs) renderMarkdown(m.content);
        const cached = performance.now() - t3;

        const reduction = uncached > 0 ? Math.round((1 - cached / uncached) * 100) : 0;
        // eslint-disable-next-line no-console
        console.log(`[V6] getAllSavedPages cold=${cold.toFixed(2)}ms warm=${warm.toFixed(2)}ms | renderMarkdown uncached=${uncached.toFixed(2)}ms cached=${cached.toFixed(2)}ms reduction=${reduction}%`);
        expect(reduction).toBeGreaterThanOrEqual(0);
    });
});
