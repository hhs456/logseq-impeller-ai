const DEBUG = false;

export const logger = {
    debug(...args: any[]) {
        if (DEBUG) console.debug('[Impeller]', ...args);
    },
    info(...args: any[]) {
        console.log('[Impeller]', ...args);
    },
    warn(...args: any[]) {
        console.warn('[Impeller]', ...args);
    },
    error(...args: any[]) {
        console.error('[Impeller]', ...args);
    },
};
