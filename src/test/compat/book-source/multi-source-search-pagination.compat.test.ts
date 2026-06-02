import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { BookSource, SearchBook } from '@/types';
import {
  MAX_SEARCH_PAGES,
  MultiSourceSearchSession,
} from '@/lib/book-source/multi-source-search';
import * as searchModule from '@/lib/book-source/search';

const SOURCE = {
  bookSourceUrl: 'https://example.com/',
  sourceUrl: 'https://example.com/',
  bookSourceName: 'test',
  bookSourceType: 0,
  enabled: true,
  loginUrl: '',
  searchUrl: '/s?q={{key}}',
  ruleSearch: { bookList: 'li', name: 'a@text', bookUrl: 'a@href' },
} as unknown as BookSource;

describe('MultiSourceSearchSession pagination', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
    vi.spyOn(searchModule, 'searchBook').mockImplementation(async (_s, _k, _o, page) => {
      if (page === 1) {
        return [
          {
            bookUrl: '/1',
            name: 'test',
            author: 'a',
            origin: 'https://example.com/',
            originName: 'test',
            type: 0,
            tocUrl: '/1',
            time: 0,
            originOrder: 0,
            chapterWordCount: -1,
            respondTime: -1,
          },
        ] satisfies SearchBook[];
      }
      return [];
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('第二页无结果时 hasMore 为 false', async () => {
    const session = new MultiSourceSearchSession();
    session.setSearchMode('extended');
    let lastHasMore = true;
    session.setCallbacks({
      onFinish: (_empty, more) => {
        lastHasMore = more;
      },
    });
    await session.search('test', [SOURCE]);
    expect(session.getResults().length).toBe(1);
    expect(session.getHasMore()).toBe(true);
    await session.search('', [SOURCE]);
    expect(session.getPage()).toBe(2);
    expect(session.getHasMore()).toBe(false);
    expect(lastHasMore).toBe(false);
  });

  it(`页码上限为 MAX_SEARCH_PAGES (${MAX_SEARCH_PAGES})`, () => {
    expect(MAX_SEARCH_PAGES).toBeGreaterThan(1);
  });
});
