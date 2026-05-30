/**
 * 阅读时章节缓存预取（相邻章 + 预下载合并去重）
 */

import * as sourcesDb from '@/lib/database/sources';
import { getChapterCacheSettings } from '@/lib/chapter-cache/settings';
import {
  fetchAndCacheChapterContent,
  readCachedChapterRaw,
} from '@/lib/chapter-cache/storage';
import type { Book, BookChapter } from '@/types';
import type { ChapterCacheSettings } from '@/lib/chapter-cache/settings';

const inflight = new Set<string>();
const MAX_PREFETCH_INFLIGHT = 2;

function taskKey(bookUrl: string, index: number): string {
  return `${bookUrl}#${index}`;
}

/** 合并相邻预取与预下载目标，避免同一章重复入队 */
export function collectPrefetchIndices(
  currentIndex: number,
  catalogLength: number,
  settings: ChapterCacheSettings,
): number[] {
  const indices = new Set<number>();

  if (settings.prefetchEnabled) {
    for (let d = 1; d <= settings.prefetchCount; d++) {
      const next = currentIndex + d;
      const prev = currentIndex - d;
      if (next < catalogLength) indices.add(next);
      if (prev >= 0) indices.add(prev);
    }
  }

  if (settings.preDownloadNum > 0) {
    for (let i = 1; i <= settings.preDownloadNum; i++) {
      const index = currentIndex + i;
      if (index >= catalogLength) break;
      indices.add(index);
    }
  }

  return [...indices].sort((a, b) => a - b);
}

/**
 * 阅读切章后后台缓存：前后相邻（可选）+ 向后预下载（Legado preDownloadNum）
 */
export async function prefetchChaptersOnRead(
  book: Book,
  catalog: BookChapter[],
  currentIndex: number,
): Promise<void> {
  if (book.origin === 'local' || book.origin?.startsWith('local::')) return;

  const settings = await getChapterCacheSettings();
  const targets = collectPrefetchIndices(
    currentIndex,
    catalog.length,
    settings,
  );
  if (targets.length === 0) return;

  const source = await sourcesDb.getSource(book.origin);
  if (!source?.enabled) return;

  for (const index of targets) {
    if (inflight.size >= MAX_PREFETCH_INFLIGHT) break;
    const key = taskKey(book.bookUrl, index);
    if (inflight.has(key)) continue;
    const existing = await readCachedChapterRaw(book.bookUrl, index);
    if (existing) continue;

    inflight.add(key);
    void (async () => {
      try {
        const chapter = catalog[index];
        if (!chapter) return;
        const next = catalog[index + 1];
        await fetchAndCacheChapterContent(
          source,
          book,
          chapter,
          next?.url,
        );
      } catch (e) {
        console.warn('[chapter-cache] prefetch failed', index, e);
      } finally {
        inflight.delete(key);
      }
    })();
  }
}
