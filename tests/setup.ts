// tests/setup.ts
import { vi } from 'vitest';
import { installLogseqMock } from './helpers/logseq-mock';

vi.mock('@logseq/libs', () => ({}));
vi.mock('@huggingface/transformers', () => ({
    pipeline: () => { throw new Error('transformers mocked'); },
    env: {},
}));
vi.mock('@orama/orama', () => ({
    create: () => { throw new Error('orama mocked'); },
    insertMultiple: () => undefined,
    search: () => ({ hits: [] }),
}));

installLogseqMock();
