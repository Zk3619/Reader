/**
 * 将已缓存章节正文中的漫画图写入磁盘缓存
 */

import * as chapterCacheDb from '@/lib/database/chapter-cache';
import * as chaptersDb from '@/lib/database/chapters';
import { readCachedChapterRaw } from '@/lib/chapter-cache/storage';
import { isMangaChapterContent } from '@/lib/media/image/manga-book-detect';
import { warmMangaImagesForCachedChapter } from '@/lib/export/export-manga-images';
import type { Book } from '@/types';

export type WarmCachedMangaImagesResult = {
  chaptersScanned: number;
  chaptersWarmed: number;
  imagesCached: number;
};

/** 遍历该书已缓存章节，对漫画章预热插图磁盘缓存 */
export async function warmCachedMangaImagesForBook(
  book: Book,
  options?: { maxChapters?: number; signal?: AbortSignal },
): Promise<WarmCachedMangaImagesResult> {
  const catalog = await chaptersDb.getChapterList(book.bookUrl);
  const cachedRows = await chapterCacheDb.listChapterCacheByBook(book.bookUrl);
  const indices = cachedRows
    .map((r) => r.chapterIndex)
    .sort((a, b) => a - b)
    .slice(0, options?.maxChapters ?? cachedRows.length);
  let chaptersScanned = 0;
  let chaptersWarmed = 0;
  let imagesCached = 0;

  for (const i of indices) {
    if (options?.signal?.aborted) break;
    const chapter = catalog[i];
    const raw = await readCachedChapterRaw(book.bookUrl, i);
    if (!raw?.trim()) continue;
    chaptersScanned += 1;
    const chapterUrl = chapter?.url ?? chapter?.baseUrl ?? '';
    if (!isMangaChapterContent(raw, chapterUrl)) continue;

    const result = await warmMangaImagesForCachedChapter(book, i, raw, chapterUrl);
    if (result.cachedImages > 0) {
      imagesCached += result.cachedImages;
    }
    if (result.complete) {
      chaptersWarmed += 1;
    }
  }

  return { chaptersScanned, chaptersWarmed, imagesCached };
}
