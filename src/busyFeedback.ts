// src/busyFeedback.ts
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
