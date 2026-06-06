import { getPooledChapterContent } from '@/lib/chapter-cache/chapter-content-pool';
import { applyChapterDisplayProcessing } from '@/lib/chapter-cache/display-processing';
import { readCachedChapterRaw } from '@/lib/chapter-cache/storage';
import * as sourcesDb from '@/lib/database/sources';
import { isLocalBook } from '@/lib/local-book';
import type { Book, BookChapter } from '@/types';

/** 不切 store 的情况下解析相邻章正文（池 → 磁盘缓存） */
export async function resolveAdjacentChapterContent(
  book: Book,
  chapterIndex: number,
): Promise<string | null> {
  if (chapterIndex < 0) return null;

  const pooled = getPooledChapterContent(book.bookUrl, chapterIndex);
  if (pooled?.trim()) return pooled;

  const raw = await readCachedChapterRaw(book.bookUrl, chapterIndex);
  if (!raw?.trim()) return null;

  const source =
    !isLocalBook(book) && book.origin
      ? await sourcesDb.getSource(book.origin)
      : null;
  const processed = await applyChapterDisplayProcessing(raw, book, source);
  return processed?.trim() ? processed : null;
}

export function adjacentChapterIndex(
  catalog: BookChapter[],
  currentIndex: number,
  direction: 'next' | 'prev',
): number | null {
  const next = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
  if (next < 0 || next >= catalog.length) return null;
  return next;
}
