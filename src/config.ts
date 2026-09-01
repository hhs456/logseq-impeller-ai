// src/config.ts
import { AppState } from './types';
import { I18N } from './i18n';

export { I18N };

export const state: AppState = {
    chatStore: {}, 
    currentPageUuid: null, 
    currentGraphPath: null, // 💡 初始化
    isBusy: false, 
    isVisible: false, 
    isCollapsed: false,
    isMemoryCollapsed: false,
    tempInput: "", 
    t: null, 
    abortController: null, 
    timer: null,
    processingPageUuid: null
};