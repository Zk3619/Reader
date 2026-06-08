/**
 * 漫画阅读器 ±1 章正文内存池（对齐 Legado ReadManga.loadContent）
 */

import { readCachedChapterRaw } from '@/lib/chapter-cache/storage';
import {
  getPooledChapterContent,
  setAdjacentChapterInPool,
  setCurrentChapterInPool,
} from '@/lib/chapter-cache/chapter-content-pool';
import { isLocalBook } from '@/lib/local-book';
import { loadChapterRaw } from '@/stores/viewer/media/chapter';
import type { Book, BookChapter } from '@/types';

let warmSession = 0;

export function cancelMangaChapterPoolWarm(): void {
  warmSession += 1;
}

/** 当前章加载成功后写入池，并后台预热相邻章正文 */
export function commitMangaChapterToPool(
  book: Book,
  catalog: BookChapter[],
  chapterIndex: number,
  raw: string,
): void {
  setCurrentChapterInPool(book.bookUrl, chapterIndex, raw);
  void warmAdjacentMangaChapterPool(book, catalog, chapterIndex);
}

async function warmAdjacentMangaChapterPool(
  book: Book,
  catalog: BookChapter[],
  currentIndex: number,
): Promise<void> {
  const token = warmSession;

  for (const offset of [-1, 1] as const) {
    const idx = currentIndex + offset;
    if (idx < 0 || idx >= catalog.length) continue;
    if (getPooledChapterContent(book.bookUrl, idx)) continue;

    const cached = await readCachedChapterRaw(book.bookUrl, idx);
    if (token !== warmSession) return;
    if (cached?.trim()) {
      setAdjacentChapterInPool(book.bookUrl, currentIndex, idx, cached);
      continue;
    }

    if (isLocalBook(book)) continue;

    const chapter = catalog[idx];
    if (!chapter || chapter.isVolume) continue;

    void loadChapterRaw(book, chapter, catalog, idx, false)
      .then((raw) => {
        if (token !== warmSession || !raw?.trim()) return;
        setAdjacentChapterInPool(book.bookUrl, currentIndex, idx, raw);
      })
      .catch(() => undefined);
  }
}
