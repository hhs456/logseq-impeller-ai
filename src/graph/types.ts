// src/graph/types.ts
export type GraphKind = 'file' | 'db';

export interface IndexableBlock {
    id: string;
    content: string;
    pageName: string;
}

// 例外不在此聯集內：查詢拋錯就讓它拋（落入 syncVectorDB 外層 catch）
export type FetchBlocksResult =
    | { status: 'ok'; kind: GraphKind; blocks: IndexableBlock[] }
    | { status: 'empty'; kind: GraphKind }
    | { status: 'unsupported'; kind: GraphKind; reason: 'db-adapter-disabled' | 'schema-mismatch'; detail: string };

export type IndexState =
    | { status: 'idle' }
    | { status: 'building'; gen?: number }
    | { status: 'ready'; blockCount: number; builtAt: number }
    | { status: 'empty' }
    | { status: 'unsupported'; reason: string }
    | { status: 'failed'; message: string };

export type SearchOutcome =
    | { status: 'ok'; hits: { id: string; content: string }[] }
    | { status: 'unavailable'; reason: 'idle' | 'building' | 'empty-graph' | 'unsupported' | 'failed' | 'search-error' };

// 語意搜尋閾值：rag.ts 檢索與 tools.ts 回報 LLM 的 similarity_threshold 共引同一來源
export const SIMILARITY_THRESHOLD = 0.3;
