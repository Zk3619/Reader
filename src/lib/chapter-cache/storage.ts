/**
 * 章节缓存统一读写（SQLite + 大文件落盘）
 */

import * as chapterCacheDb from '@/lib/database/chapter-cache';
import {
  CHAPTER_FILE_THRESHOLD_BYTES,
  deleteBookCacheFiles,
  deleteChapterFile,
  readChapterFile,
  writeChapterFile,
  clearAllChapterCacheFiles,
} from '@/lib/chapter-cache/file-storage';
import type { Book, BookChapter, BookSource } from '@/types';
import { enforceChapterCacheLimits } from '@/lib/chapter-cache/eviction';

export async function readCachedChapterRaw(
  bookUrl: string,
  chapterIndex: number,
): Promise<string | null> {
  const row = await chapterCacheDb.getChapterCache(bookUrl, chapterIndex);
  if (!row) return null;
  if (row.filePath) {
    return readChapterFile(row.filePath);
  }
  const text = row.content?.trim();
  return text ? row.content : null;
}

export async function writeCachedChapterRaw(
  book: Pick<Book, 'bookUrl' | 'name'>,
  chapterIndex: number,
  content: string,
): Promise<void> {
  if (!content.trim()) return;
  const bytes = new TextEncoder().encode(content).byteLength;
  const now = Math.floor(Date.now() / 1000);

  if (bytes > CHAPTER_FILE_THRESHOLD_BYTES) {
    const existing = await chapterCacheDb.getChapterCache(book.bookUrl, chapterIndex);
    if (existing?.filePath) {
      await deleteChapterFile(existing.filePath);
    }
    const filePath = await writeChapterFile(
      book.bookUrl,
      book.name,
      chapterIndex,
      content,
    );
    await chapterCacheDb.upsertChapterCache({
      bookUrl: book.bookUrl,
      chapterIndex,
      content: '',
      filePath,
      createdAt: now,
    });
    notifyChapterCacheUpdated(book.bookUrl);
    await enforceChapterCacheLimits().catch(() => {});
    return;
  }

  const existing = await chapterCacheDb.getChapterCache(book.bookUrl, chapterIndex);
  if (existing?.filePath) {
    await deleteChapterFile(existing.filePath);
  }
  await chapterCacheDb.upsertChapterCache({
    bookUrl: book.bookUrl,
    chapterIndex,
    content,
    filePath: null,
    createdAt: now,
  });
  notifyChapterCacheUpdated(book.bookUrl);
  await enforceChapterCacheLimits().catch(() => {});
}

function notifyChapterCacheUpdated(bookUrl: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('chapter-cache-updated', { detail: { bookUrl } }),
  );
}

export async function deleteCachedChapter(
  bookUrl: string,
  chapterIndex: number,
): Promise<void> {
  const row = await chapterCacheDb.getChapterCache(bookUrl, chapterIndex);
  if (row?.filePath) {
    await deleteChapterFile(row.filePath);
  }
  await chapterCacheDb.deleteChapterCache(bookUrl, chapterIndex);
}

export async function deleteCachedChaptersByBook(
  book: Pick<Book, 'bookUrl' | 'name'>,
): Promise<void> {
  const rows = await chapterCacheDb.listChapterCacheByBook(book.bookUrl);
  for (const row of rows) {
    if (row.filePath) {
      await deleteChapterFile(row.filePath);
    }
  }
  await chapterCacheDb.deleteChapterCacheByBook(book.bookUrl);
  await deleteBookCacheFiles(book.bookUrl, book.name);
}

export async function clearAllCachedChapters(): Promise<void> {
  await chapterCacheDb.clearAllChapterCache();
  await clearAllChapterCacheFiles();
}

export async function countCachedChapters(bookUrl: string): Promise<number> {
  return chapterCacheDb.countChapterCacheByBook(bookUrl);
}

export async function fetchAndCacheChapterContent(
  source: BookSource,
  book: Book,
  chapter: BookChapter,
  nextChapterUrl?: string,
): Promise<string | null> {
  const { getContent } = await import('@/lib/book-source/content');
  const raw = await getContent(source, chapter, nextChapterUrl, book, {
    skipReplaceRules: true,
  });
  if (raw) {
    await writeCachedChapterRaw(book, chapter.index, raw);
  }
  return raw;
}
