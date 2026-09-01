import '@logseq/libs';

export async function copyToClipboard(text: string, successLabel: string): Promise<void> {
    try {
        await window.parent.navigator.clipboard.writeText(text);
        logseq.UI.showMsg(successLabel, 'success');
    } catch (err) {
        const textArea = window.parent.document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";

        window.parent.document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            const successful = window.parent.document.execCommand('copy');
            window.parent.document.body.removeChild(textArea);

            if (successful) {
                logseq.UI.showMsg(`${successLabel} (fallback)`, 'success');
            } else {
                throw new Error('execCommand returned false');
            }
        } catch (fallbackErr) {
            window.parent.document.body.removeChild(textArea);
            console.error('Clipboard copy failed:', err, fallbackErr);
            logseq.UI.showMsg('❌ Copy failed', 'error');
        }
    }
}
