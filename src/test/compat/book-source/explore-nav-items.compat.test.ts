import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BookSource } from '@/types';
import { getSourceArgsKey } from '@/lib/js-engine/legado/source-script-shared';
import {
  getExploreSectionSelectDisplayValue,
  updateExploreSourceArgument,
} from '@/lib/book-source/explore-sections';
import {
  buildExploreSectionNavItems,
  getExploreArgumentSelectValue,
} from '@/lib/book-source/explore-nav-items';

describe('explore nav select value sync', () => {
  const source = {
    bookSourceUrl: 'https://example.com',
    sourceUrl: 'https://example.com',
    sourceName: '示例',
  } as BookSource;

  const ls = new Map<string, string>();

  afterEach(() => {
    vi.unstubAllGlobals();
    ls.clear();
  });

  it('getExploreArgumentSelectValue matches drawer display after localStorage update', () => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => ls.get(k) ?? null,
      setItem: (k: string, v: string) => ls.set(k, v),
      removeItem: (k: string) => ls.delete(k),
    });

    const sections = [
      {
        title: '模式',
        type: 'select',
        chars: ['小说', '听书'],
        default: '小说',
        paramKey: 'find_tab',
      },
    ];

    updateExploreSourceArgument(source, 'find_tab', '听书');

    const items = buildExploreSectionNavItems(sections);
    expect(items[0]?.kind).toBe('select');
    if (items[0]?.kind !== 'select') return;

    expect(getExploreArgumentSelectValue(items[0], null, source)).toBe('听书');
    expect(getExploreSectionSelectDisplayValue(source, sections[0])).toBe('听书');
    expect(ls.has(getSourceArgsKey(source))).toBe(true);
  });
});
