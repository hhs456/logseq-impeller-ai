// tests/graph-kind.test.ts
// 2.0.2 實測（診斷時間軸）：db worker 就緒前 checkCurrentIsDbGraph 回 false。
// 本檔鎖定探測的 schema 特徵覆核與舊宿主路徑（R1）。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installLogseqMock, LogseqMock } from './helpers/logseq-mock';
import { probeGraphKind } from '../src/graph/kind';

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
