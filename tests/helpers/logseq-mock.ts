// tests/helpers/logseq-mock.ts
// 提供可重置的 @logseq/libs 假實作與側欄 DOM 骨架，供端到端 UI 測試使用。
import { vi } from 'vitest';
import { MemoryManager } from '../../src/memory';

export interface LogseqMock {
    settings: Record<string, any>;
    updateSettings: any;
    useSettingsSchema: any;
    onSettingsChanged: any;
    ready: any;
    beforeunload: any;
    provideUI: any;
    provideStyle: any;
    provideModel: any;
    UI: { showMsg: any };
    App: Record<string, any>;
    Editor: Record<string, any>;
    DB: Record<string, any>;
    __beforeunloadCallbacks: Function[];
}

export function createLogseqMock(): LogseqMock {
    const mock: LogseqMock = {
        settings: {},
        updateSettings: vi.fn((patch: Record<string, any>) => {
            Object.assign(mock.settings, patch);
        }),
        useSettingsSchema: vi.fn(),
        onSettingsChanged: vi.fn(),
        ready: vi.fn(),
        beforeunload: vi.fn((cb: Function) => {
            mock.__beforeunloadCallbacks.push(cb);
        }),
        provideUI: vi.fn((opts: { key: string; path?: string; template: string }) => {
            const target = document.querySelector('#right-sidebar .sidebar-item-list');
            if (target) target.innerHTML = opts.template ?? '';
        }),
        provideStyle: vi.fn(),
        provideModel: vi.fn(),
        UI: { showMsg: vi.fn() },
        App: {
            getUserConfigs: vi.fn(async () => ({ preferredLanguage: 'en' })),
            getCurrentGraph: vi.fn(async () => ({ path: 'D:/graphs/test-graph' })),
            registerUIItem: vi.fn(),
            registerCommand: vi.fn(),
            registerCommandPalette: vi.fn(),
            pushState: vi.fn(async () => undefined),
            setRightSidebarVisible: vi.fn(async () => undefined),
            openExternalLink: vi.fn(),
            onRouteChanged: vi.fn(),
            onCurrentGraphChanged: vi.fn(),
        },
        Editor: {
            getCurrentPage: vi.fn(async () => null),
            getCurrentBlock: vi.fn(async () => null),
            getBlock: vi.fn(async () => null),
            getPage: vi.fn(async () => null),
            getPageBlocksTree: vi.fn(async () => []),
            appendBlockInPage: vi.fn(async () => null),
            insertBlock: vi.fn(async () => null),
            insertBatchBlock: vi.fn(async () => null),
            removeBlock: vi.fn(async () => undefined),
        },
        DB: {
            q: vi.fn(async () => []),
            sync: vi.fn(async () => []),
            transaction: vi.fn(),
        },
        __beforeunloadCallbacks: [],
    };
    return mock;
}

export function resetSidebarDom(): void {
    document.body.innerHTML = `
        <div id="right-sidebar">
            <div class="sidebar-item-list"></div>
        </div>`;
}

export function installLogseqMock(): LogseqMock {
    const mock = createLogseqMock();
    (globalThis as any).logseq = mock;
    resetSidebarDom();
    localStorage.clear();
    MemoryManager.invalidateMemoryIndex();
    return mock;
}
