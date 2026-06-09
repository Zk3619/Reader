/**
 * 将已缓存章节正文中的听书音频写入磁盘缓存
 */

import * as chapterCacheDb from '@/lib/database/chapter-cache';
import * as chaptersDb from '@/lib/database/chapters';
import { readCachedChapterRaw } from '@/lib/chapter-cache/storage';
import { isAudioChapterContent } from '@/lib/media/audio/audio-book-detect';
import { warmAudioForCachedChapter } from '@/lib/export/export-audio';
import type { Book } from '@/types';

export type WarmCachedAudioResult = {
  chaptersScanned: number;
  chaptersWarmed: number;
  tracksCached: number;
};

export async function warmCachedAudioForBook(
  book: Book,
  options?: { maxChapters?: number; signal?: AbortSignal },
): Promise<WarmCachedAudioResult> {
  const catalog = await chaptersDb.getChapterList(book.bookUrl);
  const cachedRows = await chapterCacheDb.listChapterCacheByBook(book.bookUrl);
  const indices = cachedRows
    .map((r) => r.chapterIndex)
    .sort((a, b) => a - b)
    .slice(0, options?.maxChapters ?? cachedRows.length);
  let chaptersScanned = 0;
  let chaptersWarmed = 0;
  let tracksCached = 0;

  for (const i of indices) {
    if (options?.signal?.aborted) break;
    const chapter = catalog[i];
    const raw = await readCachedChapterRaw(book.bookUrl, i);
    if (!raw?.trim() || !isAudioChapterContent(raw)) continue;
    chaptersScanned += 1;
    const result = await warmAudioForCachedChapter(book, i, raw, chapter);
    if (result.cachedTracks > 0) {
      tracksCached += result.cachedTracks;
    }
    if (result.complete) {
      chaptersWarmed += 1;
    }
  }

  return { chaptersScanned, chaptersWarmed, tracksCached };
}
