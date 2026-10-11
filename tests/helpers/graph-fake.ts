// tests/helpers/graph-fake.ts
// Schema-aware datascriptQuery fake：模擬「未知屬性回空集合」的 datascript 行為。
// file 圖譜只認 :block/content；DB 圖譜只認 :block/title。查詢含對方屬性 → 回 []。
// 限制：僅基於文件化 schema，不能取代夜版實測。
import { vi } from 'vitest';

export type FakeKind = 'file' | 'db';

export interface SchemaAwareFakeOptions {
    kind: FakeKind;
    fileRows?: any[];   // file schema 查詢回的行（未經 [row] 包裹）
    dbRows?: any[];     // db schema 查詢回的行（欄位含 title / full-title / page.title）
    pageCount?: number; // canary (count ?b) 的結果，預設 0
}

export function createSchemaAwareFake(opts: SchemaAwareFakeOptions) {
    return vi.fn(async (query: string) => {
        if (query.includes('(count')) return opts.pageCount ?? 0;
        if (opts.kind === 'file' && query.includes(':block/content')) {
            return (opts.fileRows ?? []).map((r) => [r]);
        }
        if (opts.kind === 'db' && query.includes(':block/title')) {
            return (opts.dbRows ?? []).map((r) => [r]);
        }
        return [];
    });
}

export function fileBlockRow(uuid: string, content: string, originalName: string, name?: string) {
    return {
        uuid,
        content,
        page: { 'original-name': originalName, name: name ?? originalName.toLowerCase() },
    };
}

export function dbBlockRow(uuid: string, title: string, fullTitle: string, pageTitle: string) {
    return {
        uuid,
        title,
        'full-title': fullTitle,
        page: { title: pageTitle },
    };
}
