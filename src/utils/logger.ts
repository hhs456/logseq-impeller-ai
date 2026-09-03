const DEBUG = import.meta.env?.DEV ?? false;

export const logger = {
    debug(...args: any[]) {
        if (DEBUG) console.debug('[Impeller]', ...args);
    },
    info(...args: any[]) {
        if (DEBUG) console.log('[Impeller]', ...args);
    },
    warn(...args: any[]) {
        if (DEBUG) console.warn('[Impeller]', ...args);
    },
    error(...args: any[]) {
        console.error('[Impeller]', ...args);
    },
};
