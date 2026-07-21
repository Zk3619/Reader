/**
 * 章节缓存统一读写（SQLite + 大文件落盘）
 */

import * as chapterCacheDb from '@/lib/database/chapter-cache';
import {
  CHAPTER_CACHE_TIER_AUTO,
  CHAPTER_CACHE_TIER_MANUAL,
  mergeChapterCacheTier,
  type ChapterCacheTier,
} from '@/lib/chapter-cache/cache-tier';
import {
  CHAPTER_FILE_THRESHOLD_BYTES,
  deleteBookCacheFiles,
  deleteChapterFile,
  readChapterFile,
  writeChapterFile,
  clearAllChapterCacheFiles,
} from '@/lib/chapter-cache/file-storage';
import { catalogCacheIndex } from '@/lib/chapter-cache/catalog-cache-index';
import type { Book, BookChapter, BookSource } from '@/types';
import { enforceChapterCacheLimits } from '@/lib/chapter-cache/eviction';
import { clearAllAudio, clearAudioByBook } from '@/lib/media/audio/audio-disk-cache';
import {
  clearAllMangaImages,
  clearMangaImagesByBook,
} from '@/lib/media/image/image-disk-cache';

export type WriteCachedChapterOptions = {
  /** auto=阅读自动；manual=用户离线缓存（不受自动淘汰） */
  cacheTier?: ChapterCacheTier;
};

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

export async function isManualCachedChapter(
  bookUrl: string,
  chapterIndex: number,
): Promise<boolean> {
  return chapterCacheDb.isManualCachedChapter(bookUrl, chapterIndex);
}

/** 用户离线队列完成一章后，将已有 auto 缓存提升为 manual */
export async function promoteChapterCacheToManual(
  bookUrl: string,
  chapterIndex: number,
): Promise<void> {
  const row = await chapterCacheDb.getChapterCache(bookUrl, chapterIndex);
  if (!row) return;
  if (row.cacheTier === CHAPTER_CACHE_TIER_MANUAL) return;
  await chapterCacheDb.setChapterCacheTier(
    bookUrl,
    chapterIndex,
    CHAPTER_CACHE_TIER_MANUAL,
  );
  notifyChapterCacheUpdated(bookUrl);
}

export async function writeCachedChapterRaw(
  book: Pick<Book, 'bookUrl' | 'name'>,
  chapterIndex: number,
  content: string,
  options?: WriteCachedChapterOptions,
): Promise<void> {
  if (!content.trim()) return;
  const bytes = new TextEncoder().encode(content).byteLength;
  const now = Math.floor(Date.now() / 1000);
  const requested = options?.cacheTier ?? CHAPTER_CACHE_TIER_AUTO;
  const existing = await chapterCacheDb.getChapterCache(book.bookUrl, chapterIndex);
  const cacheTier = mergeChapterCacheTier(existing?.cacheTier, requested);

  if (bytes > CHAPTER_FILE_THRESHOLD_BYTES) {
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
      cacheTier,
    });
    notifyChapterCacheUpdated(book.bookUrl);
    if (cacheTier === CHAPTER_CACHE_TIER_AUTO) {
      await enforceChapterCacheLimits().catch(() => { });
    }
    return;
  }

  if (existing?.filePath) {
    await deleteChapterFile(existing.filePath);
  }
  await chapterCacheDb.upsertChapterCache({
    bookUrl: book.bookUrl,
    chapterIndex,
    content,
    filePath: null,
    createdAt: now,
    cacheTier,
  });
  notifyChapterCacheUpdated(book.bookUrl);
  if (cacheTier === CHAPTER_CACHE_TIER_AUTO) {
    await enforceChapterCacheLimits().catch(() => { });
  }
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
  await clearMangaImagesByBook(book.bookUrl);
  await clearAudioByBook(book.bookUrl);
}

export async function clearAllCachedChapters(): Promise<void> {
  await chapterCacheDb.clearAllChapterCache();
  await clearAllChapterCacheFiles();
  await clearAllMangaImages();
  await clearAllAudio();
}

export async function countCachedChapters(bookUrl: string): Promise<number> {
  return chapterCacheDb.countChapterCacheByBook(bookUrl);
}

export type FetchAndCacheChapterOptions = {
  cacheIndex?: number;
  cacheTier?: ChapterCacheTier;
  /** 懒加载：首屏正文回调（续页前即可展示） */
  onPartialContent?: (raw: string) => void | Promise<void>;
  /** 预取/批量下载时跳过懒加载续页（对齐 Max CacheBook） */
  skipLazyContinuation?: boolean;
};

export async function fetchAndCacheChapterContent(
  source: BookSource,
  book: Book,
  chapter: BookChapter,
  nextChapterUrl?: string,
  cacheIndexOrOptions?: number | FetchAndCacheChapterOptions,
): Promise<string | null> {
  const options: FetchAndCacheChapterOptions =
    typeof cacheIndexOrOptions === 'number'
      ? { cacheIndex: cacheIndexOrOptions }
      : (cacheIndexOrOptions ?? {});
  const { getContent, fetchLazyContentContinuation } = await import('@/lib/book-source/content');
  const { isLegadoBrowserPlaceholderContent } = await import(
    '@/lib/book-source/extract-rule-content'
  );

  let lazyNext: string | undefined;
  let raw = await getContent(source, chapter, nextChapterUrl, book, {
    skipReplaceRules: true,
    onLazyNextContentUrl: (u) => {
      lazyNext = u;
    },
  });

  if (raw && !isLegadoBrowserPlaceholderContent(raw)) {
    const idx =
      options.cacheIndex ?? catalogCacheIndex(chapter.index, chapter);
    await writeCachedChapterRaw(book, idx, raw, {
      cacheTier: options.cacheTier,
    });
    await options.onPartialContent?.(raw);

    if (
      source.nextPageLazyLoad &&
      lazyNext &&
      !options.skipLazyContinuation
    ) {
      const visited = new Set<string>();
      const rest = await fetchLazyContentContinuation(
        source,
        chapter,
        lazyNext,
        book,
        {
          skipReplaceRules: true,
          _visitedUrls: visited,
          onPageAppended: async (acc) => {
            const merged = `${raw}\n${acc}`;
            await writeCachedChapterRaw(book, idx, merged, {
              cacheTier: options.cacheTier,
            });
            await options.onPartialContent?.(merged);
          },
        },
      );
      if (rest.trim()) {
        raw = `${raw}\n${rest}`;
        await writeCachedChapterRaw(book, idx, raw, {
          cacheTier: options.cacheTier,
        });
      }
    }
  }
  return raw;
}
