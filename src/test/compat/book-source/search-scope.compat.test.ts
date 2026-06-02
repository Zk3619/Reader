import { describe, expect, it } from 'vitest';
import {
  SEARCH_SCOPE_MAX_PERSISTED_ITEMS,
  SEARCH_SCOPE_NEAR_ALL_RATIO,
  decodeScopeFromStorage,
  encodeScopeForStorage,
  formatSourceScopeUrls,
  normalizeStoredSearchScope,
  parseSourceScopes,
} from '@/lib/book-source/search-scope';

describe('search scope persistence', () => {
  it('encodes group scope as structured items', () => {
    expect(encodeScopeForStorage('玄幻,都市')).toEqual({
      v: 2,
      kind: 'group',
      items: ['玄幻', '都市'],
    });
  });

  it('encodes single-source scope as one URL', () => {
    expect(encodeScopeForStorage('书源A::https://a.test')).toEqual({
      v: 2,
      kind: 'source',
      items: ['https://a.test'],
    });
  });

  it('encodes multi-source scope as URL list only', () => {
    const scope = '书源A::https://a.test;书源B::https://b.test';
    expect(encodeScopeForStorage(scope)).toEqual({
      v: 2,
      kind: 'source',
      items: ['https://a.test', 'https://b.test'],
    });
  });

  it('decodes single stored URL back to compact runtime scope', () => {
    expect(
      decodeScopeFromStorage({ v: 2, kind: 'source', items: ['https://a.test'] }),
    ).toBe('::https://a.test');
  });

  it('decodes stored URLs back to compact runtime scope', () => {
    const runtime = decodeScopeFromStorage({
      v: 2,
      kind: 'source',
      items: ['https://a.test', 'https://b.test'],
    });
    expect(parseSourceScopes(runtime)).toEqual([
      { name: '', url: 'https://a.test' },
      { name: '', url: 'https://b.test' },
    ]);
  });

  it('formatSourceScopeUrls deduplicates URLs', () => {
    expect(formatSourceScopeUrls(['https://a.test', 'https://a.test', 'https://b.test'])).toBe(
      '::https://a.test;::https://b.test',
    );
  });

  it('normalizes near-all source selection to all', () => {
    const stored = normalizeStoredSearchScope(
      {
        v: 2,
        kind: 'source',
        items: Array.from({ length: 95 }, (_, i) => `https://s${i}.test`),
      },
      { enabledSourceCount: 100 },
    );
    expect(stored.kind).toBe('all');
  });

  it('normalizes near-all group selection to all', () => {
    const stored = normalizeStoredSearchScope(
      {
        v: 2,
        kind: 'group',
        items: Array.from({ length: 19 }, (_, i) => `分组${i}`),
      },
      { enabledGroupCount: 20 },
    );
    expect(stored.kind).toBe('all');
  });

  it('normalizes oversized item count to all', () => {
    const stored = normalizeStoredSearchScope(
      {
        v: 2,
        kind: 'source',
        items: Array.from(
          { length: SEARCH_SCOPE_MAX_PERSISTED_ITEMS + 1 },
          (_, i) => `https://s${i}.test`,
        ),
      },
      { enabledSourceCount: SEARCH_SCOPE_MAX_PERSISTED_ITEMS + 10 },
    );
    expect(stored.kind).toBe('all');
  });

  it('keeps partial selection below near-all threshold', () => {
    const items = Array.from({ length: 10 }, (_, i) => `https://s${i}.test`);
    const stored = normalizeStoredSearchScope(
      { v: 2, kind: 'source', items },
      { enabledSourceCount: 100 },
    );
    expect(stored).toEqual({ v: 2, kind: 'source', items });
    expect(
      Math.ceil(10 / 100) < SEARCH_SCOPE_NEAR_ALL_RATIO ||
        stored.kind === 'source',
    ).toBe(true);
  });
});
