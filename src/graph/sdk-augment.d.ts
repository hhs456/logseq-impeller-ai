// src/graph/sdk-augment.d.ts
// 計畫 §4.6：以 module augmentation 補 0.0.17 型別缺口，不升 @logseq/libs。
// 日後升版（next 0.3.4 或更新的 latest）時刪除此檔即可。
// moduleResolution: bundler 下子路徑可解析性 [未證]；typecheck 失敗則退回
// graph/kind.ts 內單一 as any 橋接（計畫 §5 風險表）。
import '@logseq/libs';

declare module '@logseq/libs/dist/LSPlugin' {
    interface AppInfo {
        supportDb?: boolean;
    }
    interface IAppProxy {
        checkCurrentIsDbGraph: () => Promise<boolean>;
    }
    interface IDBProxy {
        customQuery: <T = any>(query: string[], ...inputs: Array<any>) => Promise<T>;
    }
}
