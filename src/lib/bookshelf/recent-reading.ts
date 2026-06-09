/**
 * 侧栏「最近读过」：合并阅读记录与书架进度，对齐 legado readRecentBooks + 书架 durChapterTime。
 */

import { loadUnifiedReadingHistory } from '@/lib/record/reading-history';
import type { Book } from '@/types';

export type RecentReadBook = {
  bookUrl: string;
  title: string;
  author: string;
  chapterName: string;
  lastReadTime: number;
  coverUrl?: string;
  book?: Book;
  missingFromShelf: boolean;
};

function toRecentReadBook(item: {
  bookName: string;
  bookAuthor: string;
  book: Book | null;
  missingFromShelf: boolean;
  lastRead: number;
  durChapterTitle: string;
}): RecentReadBook {
  return {
    bookUrl: item.book?.bookUrl ?? '',
    title: item.bookName,
    author: item.bookAuthor,
    chapterName: item.durChapterTitle?.trim() || '尚未开始阅读',
    lastReadTime: item.lastRead,
    coverUrl: item.book?.customCoverUrl || item.book?.coverUrl,
    book: item.book ?? undefined,
    missingFromShelf: item.missingFromShelf,
  };
}

/** 获取最近阅读书籍（按最近阅读时间排序，最多 limit 本） */
export async function getRecentReadBooks(limit = 5): Promise<RecentReadBook[]> {
  const items = await loadUnifiedReadingHistory();
  return items.slice(0, limit).map(toRecentReadBook);
}
