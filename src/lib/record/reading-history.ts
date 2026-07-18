/**
 * 统一阅读历史：合并 readRecord 时长统计、书架阅读进度与试读列表。
 */

import * as booksDb from '@/lib/database/books';
import * as readRecordsDb from '@/lib/database/read-records';
import { bookFromPreviewItem } from '@/lib/bookshelf/preview-book';
import type { Book } from '@/types';

export type UnifiedReadingItem = {
  bookName: string;
  bookAuthor: string;
  book: Book | null;
  missingFromShelf: boolean;
  lastRead: number;
  readTime: number;
  durChapterTitle: string;
  durChapterIndex: number;
  deviceId: string;
  hasDurationRecord: boolean;
};

export function recordKey(name: string, author: string): string {
  return `${name}\0${author ?? ''}`;
}

function hasReadingProgress(book: Book): boolean {
  return (
    (book.durChapterIndex ?? 0) > 0 ||
    Boolean(book.durChapterTitle?.trim()) ||
    (book.durChapterTime ?? 0) > 0
  );
}

function buildBookLookup(books: Book[]): Map<string, Book> {
  const lookup = new Map<string, Book>();
  for (const book of books) {
    lookup.set(recordKey(book.name, book.author ?? ''), book);
  }
  return lookup;
}

function mergeItem(
  map: Map<string, UnifiedReadingItem>,
  next: UnifiedReadingItem,
): void {
  const key = recordKey(next.bookName, next.bookAuthor);
  const existing = map.get(key);
  if (!existing) {
    map.set(key, next);
    return;
  }
  if (next.lastRead > existing.lastRead) {
    existing.lastRead = next.lastRead;
    existing.durChapterTitle = next.durChapterTitle || existing.durChapterTitle;
    existing.durChapterIndex = next.durChapterIndex ?? existing.durChapterIndex;
  }
  if (next.readTime > existing.readTime) {
    existing.readTime = next.readTime;
    existing.hasDurationRecord =
      existing.hasDurationRecord || next.hasDurationRecord;
  }
  if (!existing.book && next.book) {
    existing.book = next.book;
    existing.missingFromShelf = next.missingFromShelf;
  } else if (existing.missingFromShelf && next.book && !next.missingFromShelf) {
    existing.book = next.book;
    existing.missingFromShelf = false;
  }
  if (next.deviceId && !existing.deviceId) {
    existing.deviceId = next.deviceId;
  }
}

/** 加载全部阅读历史，按最近阅读时间降序 */
export async function loadUnifiedReadingHistory(): Promise<UnifiedReadingItem[]> {
  const map = new Map<string, UnifiedReadingItem>();
  const books = await booksDb.getAllBooks();
  const bookByKey = buildBookLookup(books);

  const records = await readRecordsDb.getAllReadRecords();
  for (const rec of records) {
    const key = recordKey(rec.bookName, rec.bookAuthor);
    const book = bookByKey.get(key) ?? null;
    mergeItem(map, {
      bookName: rec.bookName,
      bookAuthor: rec.bookAuthor ?? '',
      book,
      missingFromShelf: !book,
      lastRead: rec.lastRead,
      readTime: rec.readTime,
      durChapterTitle: rec.durChapterTitle || book?.durChapterTitle || '',
      durChapterIndex: rec.durChapterIndex ?? book?.durChapterIndex ?? 0,
      deviceId: rec.deviceId,
      hasDurationRecord: true,
    });
  }

  for (const book of books) {
    if (!hasReadingProgress(book)) continue;
    mergeItem(map, {
      bookName: book.name,
      bookAuthor: book.author ?? '',
      book,
      missingFromShelf: false,
      lastRead: book.durChapterTime,
      readTime: 0,
      durChapterTitle: book.durChapterTitle || '',
      durChapterIndex: book.durChapterIndex ?? 0,
      deviceId: '',
      hasDurationRecord: false,
    });
  }

  // 试读列表：未加书架的客书进度 / 打开时间
  try {
    const { getPreviewItemsByKind } = await import('@/lib/database/media-groups');
    const previews = await getPreviewItemsByKind();
    for (const item of previews) {
      const displayBook = bookFromPreviewItem(item);
      if (!displayBook) continue;
      let progressTitle = displayBook.durChapterTitle || '';
      let progressIndex = displayBook.durChapterIndex ?? 0;
      let lastRead = Math.max(
        item.lastOpenedAt ?? 0,
        displayBook.durChapterTime ?? 0,
      );
      try {
        const parsed = JSON.parse(item.refJson) as Partial<Book>;
        progressTitle = parsed.durChapterTitle || progressTitle;
        progressIndex = parsed.durChapterIndex ?? progressIndex;
        lastRead = Math.max(lastRead, parsed.durChapterTime ?? 0);
      } catch {
        /* ignore */
      }
      if (lastRead <= 0 && !progressTitle && progressIndex <= 0) {
        lastRead = item.createdAt || Date.now();
      }
      mergeItem(map, {
        bookName: displayBook.name,
        bookAuthor: displayBook.author ?? '',
        book: displayBook,
        missingFromShelf: true,
        lastRead,
        readTime: 0,
        durChapterTitle: progressTitle,
        durChapterIndex: progressIndex,
        deviceId: '',
        hasDurationRecord: false,
      });
    }
  } catch (e) {
    console.warn('[reading-history] merge preview items failed', e);
  }

  return [...map.values()].sort((a, b) => b.lastRead - a.lastRead);
}
