// tests/graph-kind.test.ts
// 探測與 schema 指紋的分層契約（2.0.2 三轮實測後重構）。
// 設計要點：探測零額外查詢（健康路徑不多付 IPC）；指紋只在 file adapter
// 回報 schema-mismatch 的異常點覆核一次。端到端覆核見 rag-state 情境 (8)。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installLogseqMock, LogseqMock } from './helpers/logseq-mock';
import { probeGraphKind, getGraphKind, fingerprintGraphKind, reclassifyByFingerprint, resetGraphKind } from '../src/graph/kind';
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
    resetGraphKind();
    clearDiag();
});

describe('probeGraphKind：零額外查詢（R1 保持）', () => {
    it('supportDb 宿主＋checkCurrent true → db', async () => {
        mock.App.getInfo = vi.fn(async () => ({ version: '2.0.2', supportDb: true }));
        mock.App.checkCurrentIsDbGraph = vi.fn(async () => true);
        mock.DB.datascriptQuery = countFake(99, 99);
        expect(await probeGraphKind()).toBe('db');
        expect(mock.DB.datascriptQuery).not.toHaveBeenCalled();
    });

    it('supportDb 宿主＋checkCurrent false → file（探測層不覆核，交給異常點）', async () => {
        mock.App.getInfo = vi.fn(async () => ({ version: '2.0.2', supportDb: true }));
        mock.App.checkCurrentIsDbGraph = vi.fn(async () => false);
        mock.DB.datascriptQuery = countFake(3412, 0);
        expect(await probeGraphKind()).toBe('file');
        expect(mock.DB.datascriptQuery).not.toHaveBeenCalled();
    });

    it('R1 舊宿主（無 supportDb）→ file，永不觸及 checkCurrentIsDbGraph、零查詢', async () => {
        mock.App.getInfo = vi.fn(async () => ({ version: '0.10.9' }));
        mock.App.checkCurrentIsDbGraph = vi.fn(async () => { throw new Error('must not run'); });
        mock.DB.datascriptQuery = vi.fn(async () => { throw new Error('must not run'); });
        expect(await probeGraphKind()).toBe('file');
        expect(mock.App.checkCurrentIsDbGraph).not.toHaveBeenCalled();
        expect(mock.DB.datascriptQuery).not.toHaveBeenCalled();
    });

    it('R1 極舊宿主：getInfo resolve 成 undefined → file（不丟錯）', async () => {
        mock.App.getInfo = vi.fn(async () => undefined as any);
        mock.App.checkCurrentIsDbGraph = vi.fn(async () => { throw new Error('must not run'); });
        expect(await probeGraphKind()).toBe('file');
        expect(mock.App.checkCurrentIsDbGraph).not.toHaveBeenCalled();
    });

    it('checkCurrent 拒絕 → 逃出並帶標籤（不得吞成 file）', async () => {
        mock.App.getInfo = vi.fn(async () => ({ version: '2.0.2', supportDb: true }));
        mock.App.checkCurrentIsDbGraph = vi.fn(async () => { throw { message: 'db-worker has not been initialized' }; });
        await expect(probeGraphKind()).rejects.toThrow(/checkCurrentIsDbGraph rejected.*db-worker/);
    });

    it('getGraphKind 快取 confident 結果：第二次零探測呼叫', async () => {
        mock.App.getInfo = vi.fn(async () => ({ version: '2.0.2', supportDb: true }));
        mock.App.checkCurrentIsDbGraph = vi.fn(async () => true);
        expect(await getGraphKind()).toBe('db');
        const calls = mock.App.checkCurrentIsDbGraph.mock.calls.length;
        expect(await getGraphKind()).toBe('db');
        expect(mock.App.checkCurrentIsDbGraph.mock.calls.length).toBe(calls);
    });
});

describe('fingerprintGraphKind：異常點覆核的判別矩陣', () => {
    it('DB 形狀（title 有列、content 全無）→ db', async () => {
        mock.DB.datascriptQuery = countFake(3412, 0);
        expect(await fingerprintGraphKind()).toBe('db');
    });

    it('file 形狀（content 有列）→ file', async () => {
        mock.DB.datascriptQuery = countFake(0, 87);
        expect(await fingerprintGraphKind()).toBe('file');
    });

    it('title 與 content 同時有列（轉換圖殘留）→ 保守判 file，不倒退於 Phase 0', async () => {
        mock.DB.datascriptQuery = countFake(50, 30);
        expect(await fingerprintGraphKind()).toBe('file');
    });

    it('全零（DB 尚在載入 或 真空圖）→ null 不確定', async () => {
        mock.DB.datascriptQuery = countFake(0, 0);
        expect(await fingerprintGraphKind()).toBeNull();
    });

    it('覆核一定留下 probe-fingerprint 與真實形狀（供下一輪定論，不再靠推論）', async () => {
        mock.DB.datascriptQuery = countFake(3412, 0);
        await fingerprintGraphKind();
        const fp = diagHistory().find((e) => e.event === 'probe-fingerprint');
        expect(fp?.detail).toBe('title=3412 content=0');
    });

    it('指紋查詢丟錯 → 逃出（由 withWorkerRetry 接，不得吞成 file）', async () => {
        mock.DB.datascriptQuery = vi.fn(async () => { throw { message: 'db-worker has not been initialized' }; });
        await expect(fingerprintGraphKind()).rejects.toThrow(/db-worker/);
    });
});

describe('reclassifyByFingerprint：定論寫入快取、不確定不寫', () => {
    it('定論 db → 寫入 kind 快取（後續 getGraphKind 直接回 db，不再探測）', async () => {
        mock.App.getInfo = vi.fn(async () => ({ version: '2.0.2' })); // supportDb 缺省
        mock.DB.datascriptQuery = countFake(3412, 0);

        expect(await getGraphKind()).toBe('file');   // 能力閘未開 → 誤判並快取
        expect(await reclassifyByFingerprint()).toBe('db');
        expect(await getGraphKind()).toBe('db');     // 覆核定論已修正快取
    });

    it('不確定（全零）→ 回 null 且絕不污染快取', async () => {
        mock.App.getInfo = vi.fn(async () => ({ version: '0.10.9' }));
        mock.DB.datascriptQuery = countFake(0, 0);

        expect(await getGraphKind()).toBe('file');
        expect(await reclassifyByFingerprint()).toBeNull();
        resetGraphKind();
        mock.DB.datascriptQuery = countFake(0, 5);
        expect(await getGraphKind()).toBe('file'); // 快取未被 null 覆寫
    });
});
