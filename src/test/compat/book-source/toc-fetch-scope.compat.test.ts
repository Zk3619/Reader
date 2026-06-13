import { beforeEach, describe, expect, it } from 'vitest';
import type { BookSource } from '@/types';
import {
  __resetTocFetchInFlightForTests,
  isChapterListFetchInFlight,
  tocFetchKey,
} from '@/lib/book-source/chapters';
import { __resetPageNavigationScopeForTests } from '@/lib/navigation/page-navigation-scope';

const source = {
  bookSourceUrl: 'https://src.example.com',
  sourceUrl: 'https://src.example.com',
  sourceName: '测试书源',
  enabled: true,
} as BookSource;

const tocUrl = 'https://example.com/toc/1';

describe('toc fetch scope', () => {
  beforeEach(() => {
    __resetPageNavigationScopeForTests();
    __resetTocFetchInFlightForTests();
  });

  it('tocFetchKey 区分 ui 与 persist 作用域', () => {
    expect(tocFetchKey(source, tocUrl, 'ui')).not.toBe(tocFetchKey(source, tocUrl, 'persist'));
    expect(tocFetchKey(source, tocUrl)).toBe(tocFetchKey(source, tocUrl, 'ui'));
  });

  it('isChapterListFetchInFlight 可按作用域查询', () => {
    expect(isChapterListFetchInFlight(source, tocUrl)).toBe(false);
    expect(isChapterListFetchInFlight(source, tocUrl, 'ui')).toBe(false);
    expect(isChapterListFetchInFlight(source, tocUrl, 'persist')).toBe(false);
  });
});
