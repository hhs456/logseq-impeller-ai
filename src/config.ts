// src/config.ts
import '@logseq/libs';
import { I18N, type I18NKey, type LangKey } from './i18n';
import type { PageChat, RunState, ToolTraceEntry } from './types';

export { I18N };
export type { I18NKey, LangKey };

// 💡 全域狀態中心 (State Hub)
// 語言於 main() 依 logseq.App.getUserConfigs() 決定；此處僅提供 en 預設。
export const state = {
    chatStore: {} as Record<string, PageChat>,
    drafts: {} as Record<string, string>,   // 💡 每頁草稿：切頁不遺失
    currentPageUuid: null as string | null,
    currentBlockUuid: null as string | null,
    currentPageName: '',
    currentGraphPath: null as string | null,
    isBusy: false,
    isVisible: false,
    isCollapsed: false,
    isMemoryCollapsed: false,
    tempInput: '',
    t: I18N.en as Record<I18NKey, string>,
    lang: 'en' as LangKey,
    run: null as RunState | null,
    liveTrace: [] as ToolTraceEntry[],  // P6b：暫態工具軌跡（busy 氣泡顯示）
    runSeq: 0,                // 💡 run 計數器：每次 withRun ++，用於判定過期回調
    contextGen: 0,            // 💡 updatePageContext 世代號：每次進入 ++
    timer: null as any,
    processingPageUuid: null as string | null,
};
