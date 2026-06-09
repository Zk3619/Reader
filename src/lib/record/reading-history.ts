/**
 * 统一阅读历史：合并 readRecord 时长统计与书架阅读进度（漫画/音频等）。
 */

import * as booksDb from '@/lib/database/books';
import * as readRecordsDb from '@/lib/database/read-records';
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
  return (book.durChapterIndex ?? 0) > 0 || Boolean(book.durChapterTitle?.trim());
}

function buildBookLookup(books: Book[]): Map<string, Book> {
  const lookup = new Map<string, Book>();
  for (const book of books) {
    lookup.set(recordKey(book.name, book.author ?? ''), book);
  }
  return lookup;
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
    map.set(key, {
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
    const key = recordKey(book.name, book.author ?? '');
    const existing = map.get(key);
    if (existing) {
      if (book.durChapterTime > existing.lastRead) {
        existing.lastRead = book.durChapterTime;
        existing.durChapterTitle = book.durChapterTitle || existing.durChapterTitle;
        existing.durChapterIndex = book.durChapterIndex ?? existing.durChapterIndex;
      }
      if (!existing.book) {
        existing.book = book;
        existing.missingFromShelf = false;
      }
      continue;
    }
    map.set(key, {
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

  return [...map.values()].sort((a, b) => b.lastRead - a.lastRead);
}
