import { describe, expect, it } from 'vitest';
import type { Book } from '@/types';
import { onlineBookNeedsChapterRepair } from '@/lib/bookshelf/save-book-to-shelf';

function shelfBook(overrides: Partial<Book> = {}): Book {
  const now = Date.now();
  return {
    bookUrl: 'https://example.com/book/1',
    tocUrl: 'https://example.com/catalog/1',
    origin: 'https://src.example.com',
    originName: '测试书源',
    name: '测试书名',
    author: '作者',
    type: 0,
    group: 0,
    latestChapterTime: now,
    lastCheckTime: now,
    lastCheckCount: 0,
    totalChapterNum: 120,
    durChapterIndex: 0,
    durChapterPos: 0,
    durVolumeIndex: 0,
    chapterInVolumeIndex: 0,
    durChapterTime: now,
    canUpdate: true,
    order: 0,
    originOrder: 0,
    syncTime: 0,
    latestChapterTitle: '第一百二十章',
    ...overrides,
  };
}

describe('shelf chapter repair eligibility', () => {
  it('onlineBookNeedsChapterRepair 在缺 latestChapterTitle 时仍为 true（阅读器打开前补全）', () => {
    expect(
      onlineBookNeedsChapterRepair(
        shelfBook({ latestChapterTitle: undefined, totalChapterNum: 0 }),
      ),
    ).toBe(true);
  });

  it('onlineBookNeedsChapterRepair 在 tocUrl 与 bookUrl 相同时为 true', () => {
    expect(
      onlineBookNeedsChapterRepair(
        shelfBook({
          bookUrl: 'https://example.com/book/1',
          tocUrl: 'https://example.com/book/1',
          latestChapterTitle: '第一章',
          totalChapterNum: 10,
        }),
      ),
    ).toBe(true);
  });

  it('onlineBookNeedsChapterRepair 对本地书返回 false', () => {
    expect(
      onlineBookNeedsChapterRepair(
        shelfBook({ origin: 'loc_book', latestChapterTitle: undefined }),
      ),
    ).toBe(false);
  });
});
