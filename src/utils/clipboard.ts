// src/utils/clipboard.ts
import '@logseq/libs';
import { logger } from './logger';

export async function copyToClipboard(text: string, successLabel: string): Promise<void> {
    const doc = window.parent.document;
    try {
        await window.parent.navigator.clipboard.writeText(text);
        logseq.UI.showMsg(successLabel, 'success');
        return;
    } catch (err) {
        logger.warn('[Impeller AI] clipboard.writeText 失敗，降級使用已棄用的 execCommand("copy")。', err);
    }

    const previousActive = doc.activeElement as HTMLElement | null;
    const textArea = doc.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    doc.body.appendChild(textArea);

    try {
        textArea.focus();
        textArea.select();
        const successful = doc.execCommand('copy');
        if (successful) {
            logseq.UI.showMsg(`${successLabel} (fallback)`, 'success');
        } else {
            logseq.UI.showMsg('❌ Copy failed', 'error');
        }
    } catch (fallbackErr) {
        logger.error('Clipboard copy failed:', fallbackErr);
        logseq.UI.showMsg('❌ Copy failed', 'error');
    } finally {
        if (textArea.isConnected) doc.body.removeChild(textArea);
        previousActive?.focus();
    }
}
