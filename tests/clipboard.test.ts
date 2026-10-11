// tests/clipboard.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installLogseqMock, createLogseqMock } from './helpers/logseq-mock';
import { copyToClipboard } from '../src/utils/clipboard';

function stubClipboard(writeText: (...args: any[]) => Promise<void>) {
    Object.defineProperty(window.navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
    });
}

beforeEach(() => {
    installLogseqMock();
});

describe('P1c: 剪貼簿', () => {
    it('navigator.clipboard 成功時顯示成功 toast', async () => {
        const mock = createLogseqMock();
        (globalThis as any).logseq = mock;
        stubClipboard(async () => {});
        await copyToClipboard('abc', '✅ copied');
        expect(mock.UI.showMsg).toHaveBeenCalledWith('✅ copied', 'success');
    });

    it('writeText 失敗 + execCommand 回 false → 失敗 toast、不拋出、無殘留 textarea、焦點還原（N4）', async () => {
        const mock = createLogseqMock();
        (globalThis as any).logseq = mock;
        stubClipboard(async () => { throw new Error('denied'); });
        (document as any).execCommand = vi.fn(() => false);

        const holder = document.createElement('div');
        holder.setAttribute('contenteditable', 'true');
        document.body.appendChild(holder);
        holder.focus();

        await expect(copyToClipboard('abc', '✅ copied')).resolves.toBeUndefined();
        expect(mock.UI.showMsg).toHaveBeenCalledWith('❌ Copy failed', 'error');
        expect(document.querySelectorAll('textarea').length).toBe(0);
        expect(document.activeElement).toBe(holder);
    });

    it('writeText 失敗 + execCommand 回 true → fallback 成功 toast 且清場', async () => {
        const mock = createLogseqMock();
        (globalThis as any).logseq = mock;
        stubClipboard(async () => { throw new Error('denied'); });
        (document as any).execCommand = vi.fn(() => true);

        await copyToClipboard('abc', '✅ copied');
        expect(mock.UI.showMsg).toHaveBeenCalledWith('✅ copied (fallback)', 'success');
        expect(document.querySelectorAll('textarea').length).toBe(0);
    });
});
