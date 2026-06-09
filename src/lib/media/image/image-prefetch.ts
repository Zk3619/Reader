/**
 * 漫画插图预加载：本章向前页（对齐 Legado mangaPreDownloadNum）
 * 跨章仅依赖正文池 + 近章末预取下一章首图（不批量预拉跨章图片）
 */

import type { Book, BookChapter, BookSource } from '@/types';
import {
  READER_INLINE_IMAGE_DEFAULT_RETRIES,
  shouldFetchReaderInlineImageAsBlob,
} from '@/lib/http/cover-image-loader';
import { normalizeImageUrl } from '@/lib/http/resolve-cover-referer';
import { toProxiedImageUrl } from '@/lib/http/proxy-image-url';
import { parseLegadoUrlWithOptions } from '@/lib/js-engine/legado/parse-legado-url-options';
import { flowImageRefs } from '@/lib/media/image/flow-images';
import type { ReaderInlineImageRef } from '@/lib/media/text/reader-content-blocks';
import { resolveAdjacentChapterContent } from '@/lib/media/text/reader-paged-cross-chapter-content';
import type { ImageViewerReadingMode } from '@/lib/media/image/image-viewer-ui-config';
import {
  loadMangaImageObjectUrl,
  peekMangaImageObjectUrl,
} from '@/lib/media/image/image-loader';

export type MangaImagePrefetchItem = Pick<
  ReaderInlineImageRef,
  'url' | 'legadoHeaders'
>;

export type MangaImagePrefetchContext = {
  referer?: string | null;
  source?: BookSource | null;
  bookUrl?: string | null;
  chapterIndex?: number;
  /** 阅读时是否写入磁盘（关则仅内存预热） */
  persistToDisk?: boolean;
};

const NEAR_END_THRESHOLD_SCROLL = 3;
const NEAR_END_THRESHOLD_PAGED = 1;

const INTRA_PREFETCH_DEBOUNCE_MS = 80;
const NEXT_CHAPTER_PREFETCH_DEBOUNCE_MS = 300;

let prefetchSession = 0;
const directPrefetchStarted = new Set<string>();
let intraPrefetchTimer: ReturnType<typeof setTimeout> | undefined;
let nextChapterFirstImageTimer: ReturnType<typeof setTimeout> | undefined;
let pendingIntraPrefetch:
  | {
    token: number;
    indices: number[];
    items: MangaImagePrefetchItem[];
    ctx: MangaImagePrefetchContext;
  }
  | undefined;

function chapterPageReferer(
  chapter: BookChapter | undefined,
  bookOrigin?: string,
): string | undefined {
  const u = chapter?.url ?? chapter?.baseUrl ?? bookOrigin;
  return typeof u === 'string' && /^https?:\/\//i.test(u) ? u : undefined;
}

function prefetchCacheKey(url: string, source?: BookSource | null): string {
  const parsed = parseLegadoUrlWithOptions(url.trim());
  const norm = normalizeImageUrl(parsed.url);
  const sourceId = source?.sourceUrl ?? source?.sourceName ?? '';
  return `${norm}\0${sourceId}`;
}

function resolveAheadCount(
  readingMode: ImageViewerReadingMode,
  mangaPreDownloadNum: number,
  mangaPagedPreDownloadNum: number,
): number {
  const n = Math.max(0, Math.round(mangaPreDownloadNum));
  if (n <= 0) return 0;
  if (readingMode === 'paged') {
    const cap = Math.max(1, Math.round(mangaPagedPreDownloadNum));
    return Math.min(cap, n);
  }
  return n;
}

/** 仅预取当前页之后的页（当前页由 IO 可见加载负责，避免与预取抢队列） */
function collectPrefetchAheadIndices(
  center: number,
  length: number,
  ahead: number,
): number[] {
  if (length <= 0 || ahead <= 0) return [];
  const indices: number[] = [];
  for (let d = 1; d <= ahead; d++) {
    const i = center + d;
    if (i >= 0 && i < length) indices.push(i);
  }
  return indices;
}

function flushIntraChapterPrefetch(): void {
  const pending = pendingIntraPrefetch;
  pendingIntraPrefetch = undefined;
  if (!pending || pending.token !== prefetchSession) return;
  prefetchMangaImages(pending.indices.map((i) => pending.items[i]), pending.ctx);
}

function scheduleIntraChapterPrefetch(
  token: number,
  indices: number[],
  items: MangaImagePrefetchItem[],
  ctx: MangaImagePrefetchContext,
): void {
  if (indices.length === 0) return;
  pendingIntraPrefetch = { token, indices, items, ctx };
  if (intraPrefetchTimer != null) clearTimeout(intraPrefetchTimer);
  intraPrefetchTimer = setTimeout(() => {
    intraPrefetchTimer = undefined;
    flushIntraChapterPrefetch();
  }, INTRA_PREFETCH_DEBOUNCE_MS);
}

/** 单张插图预热：磁盘 + 独立内存缓存；直链走 Image 解码缓存 */
export function prefetchMangaImage(
  item: MangaImagePrefetchItem,
  ctx: MangaImagePrefetchContext,
  pageIndex?: number,
): void {
  const parsed = parseLegadoUrlWithOptions(item.url?.trim() ?? '');
  const norm = normalizeImageUrl(parsed.url);
  if (!norm || norm.startsWith('data:')) return;

  const legadoHeaders = item.legadoHeaders ?? parsed.headers;
  const peekOpts = {
    referer: ctx.referer,
    source: ctx.source,
    legadoImageHeaders: legadoHeaders,
  };

  if (peekMangaImageObjectUrl(norm, peekOpts)) return;

  if (
    shouldFetchReaderInlineImageAsBlob(norm, {
      legadoImageHeaders: legadoHeaders,
    })
  ) {
    void loadMangaImageObjectUrl(item.url, {
      ...peekOpts,
      bookUrl: ctx.bookUrl,
      chapterIndex: ctx.chapterIndex,
      pageIndex,
      readerInlineQueue: true,
      readerInlineQueuePriority: 'low',
      maxRetries: READER_INLINE_IMAGE_DEFAULT_RETRIES,
      timeoutMs: 25_000,
      diskOnly: true,
      persistToDisk: ctx.persistToDisk !== false,
    }).then((url) => {
      if (url && typeof URL !== 'undefined') {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      }
    });
    return;
  }

  const key = prefetchCacheKey(item.url, ctx.source);
  if (directPrefetchStarted.has(key)) return;
  directPrefetchStarted.add(key);

  const direct = toProxiedImageUrl(norm, peekOpts) ?? norm;
  const img = new Image();
  img.referrerPolicy = 'no-referrer';
  img.decoding = 'async';
  img.src = direct;
}

export function prefetchMangaImages(
  items: MangaImagePrefetchItem[],
  ctx: MangaImagePrefetchContext,
  startPageIndex = 0,
): void {
  items.forEach((item, offset) => {
    prefetchMangaImage(item, ctx, startPageIndex + offset);
  });
}

export function cancelMangaImagePrefetchSession(): void {
  prefetchSession += 1;
  directPrefetchStarted.clear();
  pendingIntraPrefetch = undefined;
  if (intraPrefetchTimer != null) {
    clearTimeout(intraPrefetchTimer);
    intraPrefetchTimer = undefined;
  }
  if (nextChapterFirstImageTimer != null) {
    clearTimeout(nextChapterFirstImageTimer);
    nextChapterFirstImageTimer = undefined;
  }
}

/** 近章末且相邻章正文已在池/缓存时，仅预取下一章第一张（对齐 Legado 跨章不批量拉图） */
async function prefetchNextChapterFirstImageIfReady(
  token: number,
  book: Book,
  catalog: BookChapter[],
  chapterIndex: number,
  ctx: MangaImagePrefetchContext,
): Promise<void> {
  if (token !== prefetchSession) return;

  const nextIdx = chapterIndex + 1;
  if (nextIdx >= catalog.length) return;

  const content = await resolveAdjacentChapterContent(book, nextIdx);
  if (token !== prefetchSession || !content?.trim()) return;

  const chapter = catalog[nextIdx];
  const refs = flowImageRefs(content, chapter?.url ?? chapter?.baseUrl ?? '');
  const first = refs[0];
  if (!first) return;

  prefetchMangaImage(first, {
    ...ctx,
    referer: chapterPageReferer(chapter, book.origin),
    chapterIndex: nextIdx,
  }, 0);
}

function scheduleNextChapterFirstImagePrefetch(
  token: number,
  book: Book,
  catalog: BookChapter[],
  chapterIndex: number,
  ctx: MangaImagePrefetchContext,
): void {
  if (nextChapterFirstImageTimer != null) {
    clearTimeout(nextChapterFirstImageTimer);
  }
  nextChapterFirstImageTimer = setTimeout(() => {
    nextChapterFirstImageTimer = undefined;
    void prefetchNextChapterFirstImageIfReady(
      token,
      book,
      catalog,
      chapterIndex,
      ctx,
    );
  }, NEXT_CHAPTER_PREFETCH_DEBOUNCE_MS);
}

export type ScheduleMangaImagePrefetchParams = {
  book: Book;
  catalog: BookChapter[];
  chapterIndex: number;
  items: MangaImagePrefetchItem[];
  /** 0-based */
  currentPageIndex: number;
  readingMode: ImageViewerReadingMode;
  mangaPreDownloadNum: number;
  mangaPagedPreDownloadNum: number;
  persistToDisk?: boolean;
  referer?: string | null;
  source?: BookSource | null;
};

/** 调度章内插图预加载（随页变化重复调用安全） */
export function scheduleMangaImagePrefetch(
  params: ScheduleMangaImagePrefetchParams,
): void {
  const token = prefetchSession;
  const {
    book,
    catalog,
    chapterIndex,
    items,
    currentPageIndex,
    readingMode,
    mangaPreDownloadNum,
    mangaPagedPreDownloadNum,
    persistToDisk,
    referer,
    source,
  } = params;

  if (items.length === 0 || catalog.length === 0) return;

  const ahead = resolveAheadCount(
    readingMode,
    mangaPreDownloadNum,
    mangaPagedPreDownloadNum,
  );
  const ctx: MangaImagePrefetchContext = {
    referer,
    source,
    bookUrl: book.bookUrl,
    chapterIndex,
    persistToDisk,
  };

  const indices = collectPrefetchAheadIndices(
    Math.max(0, currentPageIndex),
    items.length,
    ahead,
  );
  scheduleIntraChapterPrefetch(token, indices, items, ctx);

  const nearEndThreshold =
    readingMode === 'paged'
      ? NEAR_END_THRESHOLD_PAGED
      : NEAR_END_THRESHOLD_SCROLL;
  const nearEnd =
    items.length > 0 && currentPageIndex >= items.length - nearEndThreshold;

  if (nearEnd) {
    scheduleNextChapterFirstImagePrefetch(
      token,
      book,
      catalog,
      chapterIndex,
      ctx,
    );
  }
}
