// tests/graph-kind.test.ts
// 2.0.2 實測（診斷時間軸）：db worker 就緒前 checkCurrentIsDbGraph 回 false。
// 本檔鎖定探測的 schema 特徵覆核與舊宿主路徑（R1）。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installLogseqMock, LogseqMock } from './helpers/logseq-mock';
import { probeGraphKind, getGraphKind, getPatientGraphKind, resetGraphKind } from '../src/graph/kind';
import { diagHistory, clearDiag } from '../src/graph/diag';

let mock: LogseqMock;

function countFake(titles: number, contents: number) {
    return vi.fn(async (query: string) => {
        if (query.includes(':block/title')) return titles;
        if (query.includes(':block/content')) return contents;
        return 0;
    });
}

beforeEach(() => {
    mock = installLogseqMock();
});

describe('probeGraphKind（含 2.0.2 worker 就緒窗口的 schema 覆核）', () => {
    it('supportDb 宿主＋checkCurrentIsDbGraph true → db，不跑覆核查詢', async () => {
        mock.App.getInfo = vi.fn(async () => ({ version: '2.0.2', supportDb: true }));
        mock.App.checkCurrentIsDbGraph = vi.fn(async () => true);
        mock.DB.datascriptQuery = countFake(99, 99);
        expect(await probeGraphKind()).toBe('db');
        expect(mock.DB.datascriptQuery).not.toHaveBeenCalled();
    });

    it('API 回 false 但 schema 是 DB（title 有列、content 無列）→ 覆核改判 db', async () => {
        mock.App.getInfo = vi.fn(async () => ({ version: '2.0.2', supportDb: true }));
        mock.App.checkCurrentIsDbGraph = vi.fn(async () => false);
        mock.DB.datascriptQuery = countFake(3412, 0);
        expect(await probeGraphKind()).toBe('db');
    });

    it('API 回 false 且 schema 是 file（content 有列）→ file，覆核不误判', async () => {
        mock.App.getInfo = vi.fn(async () => ({ version: '2.0.2', supportDb: true }));
        mock.App.checkCurrentIsDbGraph = vi.fn(async () => false);
        mock.DB.datascriptQuery = countFake(0, 87);
        expect(await probeGraphKind()).toBe('file');
    });

    it('空圖（兩種 count 皆 0）→ file（空 DB 圖誤判 file 終態同為 empty，無害）', async () => {
        mock.App.getInfo = vi.fn(async () => ({ version: '2.0.2', supportDb: true }));
        mock.App.checkCurrentIsDbGraph = vi.fn(async () => false);
        mock.DB.datascriptQuery = countFake(0, 0);
        expect(await probeGraphKind()).toBe('file');
    });

    it('覆核查詢撞上 worker 未就緒 → 逃出（交給 rag.ts 重試層，不得吞成 file）', async () => {
        mock.App.getInfo = vi.fn(async () => ({ version: '2.0.2', supportDb: true }));
        mock.App.checkCurrentIsDbGraph = vi.fn(async () => false);
        mock.DB.datascriptQuery = vi.fn(async () => {
            throw { message: 'db-worker has not been initialized', name: 'Error' };
        });
        await expect(probeGraphKind()).rejects.toThrow(/db-worker has not been initialized/);
    });

    it('R1 舊宿主：getInfo 無 supportDb → file，永不觸及 checkCurrentIsDbGraph／覆核', async () => {
        mock.App.getInfo = vi.fn(async () => ({ version: '0.10.9' }));
        mock.App.checkCurrentIsDbGraph = vi.fn(async () => { throw new Error('must not run'); });
        mock.DB.datascriptQuery = vi.fn(async () => { throw new Error('must not run'); });
        expect(await probeGraphKind()).toBe('file');
        expect(mock.App.checkCurrentIsDbGraph).not.toHaveBeenCalled();
        expect(mock.DB.datascriptQuery).not.toHaveBeenCalled();
    });

    it('R1 極舊宿主：getInfo resolve 成 undefined → file（不丟錯）', async () => {
        mock.App.getInfo = vi.fn(async () => undefined as any);
        expect(await probeGraphKind()).toBe('file');
    });
});

// 2.0.2 實測階段②：worker 就緒但 DB 尚在載入 → checkCurrent false ＋ count 全零。
// 此判定與真空圖無法區分 → 不確定：絕不快取，同步路徑退避重探。
describe('不確定判定（階段②）不快取；getPatientGraphKind 退避重探', () => {
    beforeEach(() => {
        resetGraphKind();
        mock.App.getInfo = vi.fn(async () => ({ version: '2.0.2', supportDb: true }));
        mock.App.checkCurrentIsDbGraph = vi.fn(async () => false);
    });

    it('getGraphKind：全零判定不寫快取——DB 載入完成後第二次呼叫改口 db', async () => {
        let titles = 0;
        mock.DB.datascriptQuery = vi.fn(async (query: string) =>
            query.includes(':block/title') ? titles : 0);

        expect(await getGraphKind()).toBe('file'); // 不確定，未快取
        titles = 3412;                             // 模擬 DB 載入完成
        expect(await getGraphKind()).toBe('db');   // 重新探測即改口（若誤快取此處會錯）
    });

    it('getPatientGraphKind：全零 → 退避重探 → db 後快取（後續呼叫零查詢）', async () => {
        clearDiag();
        let calls = 0;
        mock.DB.datascriptQuery = vi.fn(async (query: string) => {
            calls++;
            const loaded = calls > 2; // 第一輪（2 條 count）全零，之後 title 有列
            if (query.includes(':block/title')) return loaded ? 100 : 0;
            return 0;
        });

        expect(await getPatientGraphKind()).toBe('db');
        const events = diagHistory().map((e) => e.event);
        expect(events).toContain('probe-ambiguous');

        const callsAfter = calls;
        expect(await getPatientGraphKind()).toBe('db'); // 快取命中
        expect(calls).toBe(callsAfter);                 // 零新查詢
    }, 10000);

    it('getPatientGraphKind 耗盡：持續全零 → 收斂 file 且不快取（真空圖無 ❌）', async () => {
        clearDiag();
        mock.DB.datascriptQuery = vi.fn(async () => 0);
        expect(await getPatientGraphKind()).toBe('file');

        const events = diagHistory().map((e) => e.event);
        expect(events.filter((ev) => ev === 'probe-ambiguous')).toHaveLength(5); // 6 tries - 1
        expect(events).toContain('probe-giveup');

        // 未快取：下一次仍會實探（此處只驗證 giveup 發生，不再等 6 輪——直接查 getGraphKind 亦無快取）
        mock.DB.datascriptQuery = vi.fn(async (query: string) =>
            query.includes(':block/title') ? 7 : 0);
        expect(await getGraphKind()).toBe('db');
    }, 15000);
});
