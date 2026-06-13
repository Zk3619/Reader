/**
 * 漫画插图加载：独立 L1 内存 + L2 磁盘，与封面缓存分离（对齐 Legado skipMemoryCache）
 */

import { isTauri } from '@/lib/platform/detect';
import {
  fetchReaderInlineImageBytes,
  shouldFetchReaderInlineImageAsBlob,
  type CoverImageLoadOptions,
} from '@/lib/http/cover-image-loader';
import {
  MANGA_IMAGE_DEFAULT_RETRIES,
  MANGA_IMAGE_FETCH_TIMEOUT_MS,
  MANGA_IMAGE_RETRY_DELAY_MS,
} from '@/lib/media/image/image-fetch-config';
import { normalizeImageUrl } from '@/lib/http/resolve-cover-referer';
import type { BookSource } from '@/types';
import type { ReaderInlineImageFetchPriority } from '@/lib/http/reader-inline-image-queue';
import {
  buildMangaImageCacheMeta,
  readMangaImageFromDisk,
  writeMangaImageToDisk,
} from '@/lib/media/image/image-disk-cache';
import {
  clearMangaImageLoadFailure,
  isMangaImageLoadBlocked,
  rememberMangaImageLoadFailure,
} from '@/lib/media/image/image-load-guard';

export type MangaImageLoadOptions = {
  referer?: string | null;
  source?: BookSource | null;
  legadoImageHeaders?: Record<string, string> | null;
  bookUrl?: string | null;
  chapterIndex?: number;
  pageIndex?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  readerInlineQueue?: boolean;
  readerInlineQueuePriority?: ReaderInlineImageFetchPriority;
  /** 预取：写入磁盘，内存仅短暂持有 */
  diskOnly?: boolean;
  /** 阅读时是否写入漫画磁盘缓存 */
  persistToDisk?: boolean;
  /** 预取失败不计入冷却（避免视口外预取失败导致进入时连续报错） */
  skipFailureGuard?: boolean;
};

const MAX_MANGA_MEMORY = isTauri() ? 256 : 64;
const memoryCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

function cacheKey(url: string, sourceId?: string): string {
  return `${normalizeImageUrl(url)}\0${sourceId ?? ''}`;
}

function sourceIdFrom(options?: MangaImageLoadOptions): string | undefined {
  return options?.source?.sourceUrl ?? options?.source?.sourceName;
}

function unlinkBlobUrl(blobUrl: string): void {
  URL.revokeObjectURL(blobUrl);
}

function trimMangaMemoryCache(): void {
  while (memoryCache.size > MAX_MANGA_MEMORY) {
    const first = memoryCache.keys().next().value;
    if (first == null) break;
    const blob = memoryCache.get(first);
    memoryCache.delete(first);
    if (blob && !isTauri()) unlinkBlobUrl(blob);
  }
}

function rememberInMangaMemory(key: string, objectUrl: string): string {
  memoryCache.set(key, objectUrl);
  trimMangaMemoryCache();
  return objectUrl;
}

function blobUrlFromBytes(bytes: ArrayBuffer, mime: string): string {
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

function toCoverFetchOptions(options?: MangaImageLoadOptions): CoverImageLoadOptions {
  return {
    referer: options?.referer,
    source: options?.source,
    legadoImageHeaders: options?.legadoImageHeaders,
    maxRetries: options?.maxRetries ?? MANGA_IMAGE_DEFAULT_RETRIES,
    retryDelayMs: options?.retryDelayMs ?? MANGA_IMAGE_RETRY_DELAY_MS,
    timeoutMs: options?.timeoutMs ?? MANGA_IMAGE_FETCH_TIMEOUT_MS,
    readerInlineQueue: options?.readerInlineQueue,
    readerInlineQueuePriority: options?.readerInlineQueuePriority,
  };
}

function shouldPersistToDisk(options?: MangaImageLoadOptions): boolean {
  if (options?.diskOnly) return true;
  return options?.persistToDisk !== false;
}

export function peekMangaImageObjectUrl(
  url: string,
  options?: Pick<MangaImageLoadOptions, 'source' | 'legadoImageHeaders'>,
): string | null {
  const normalized = normalizeImageUrl(url?.trim() ?? '');
  if (
    !normalized ||
    !shouldFetchReaderInlineImageAsBlob(normalized, {
      legadoImageHeaders: options?.legadoImageHeaders,
    })
  ) {
    return null;
  }
  return memoryCache.get(cacheKey(normalized, sourceIdFrom(options))) ?? null;
}

export function evictMangaImageMemoryCache(
  url: string,
  source?: BookSource | null,
): void {
  const normalized = normalizeImageUrl(url.trim());
  const sourceId = source?.sourceUrl ?? source?.sourceName;
  const key = cacheKey(normalized, sourceId);
  const existing = memoryCache.get(key);
  if (existing) {
    unlinkBlobUrl(existing);
    memoryCache.delete(key);
  }
}

export function releaseMangaImageMemoryCache(): void {
  for (const blob of memoryCache.values()) {
    unlinkBlobUrl(blob);
  }
  memoryCache.clear();
}

async function loadMangaImageObjectUrlInner(
  url: string,
  options?: MangaImageLoadOptions,
): Promise<string | null> {
  const raw = url?.trim();
  if (!raw) return null;
  const normalized = normalizeImageUrl(raw);
  if (
    !shouldFetchReaderInlineImageAsBlob(normalized, {
      legadoImageHeaders: options?.legadoImageHeaders,
    })
  ) {
    return null;
  }

  const sid = sourceIdFrom(options);
  if (isMangaImageLoadBlocked(normalized, sid)) {
    return null;
  }

  const key = cacheKey(normalized, sid);
  const mem = memoryCache.get(key);
  if (mem) return mem;

  const disk = await readMangaImageFromDisk(normalized, sid);
  if (disk) {
    const objectUrl = blobUrlFromBytes(disk.bytes, disk.meta.mime);
    if (!options?.diskOnly) {
      rememberInMangaMemory(key, objectUrl);
    }
    clearMangaImageLoadFailure(normalized, sid);
    return objectUrl;
  }

  const data = await fetchReaderInlineImageBytes(raw, toCoverFetchOptions(options));
  if (!data) {
    if (!options?.skipFailureGuard) {
      rememberMangaImageLoadFailure(normalized, sid);
    }
    return null;
  }

  clearMangaImageLoadFailure(normalized, sid);

  const bookUrl = options?.bookUrl?.trim();
  if (
    bookUrl &&
    options?.chapterIndex != null &&
    options?.pageIndex != null &&
    shouldPersistToDisk(options)
  ) {
    const meta = await buildMangaImageCacheMeta(normalized, {
      bookUrl,
      chapterIndex: options.chapterIndex,
      pageIndex: options.pageIndex,
      sourceId: sid,
    });
    await writeMangaImageToDisk(meta, data.bytes, data.mime).catch(() => undefined);
  }

  const objectUrl = blobUrlFromBytes(data.bytes, data.mime);
  if (options?.diskOnly) {
    if (!isTauri()) {
      setTimeout(() => unlinkBlobUrl(objectUrl), 0);
    }
    return objectUrl;
  }
  return rememberInMangaMemory(key, objectUrl);
}

export async function loadMangaImageObjectUrl(
  url: string,
  options?: MangaImageLoadOptions,
): Promise<string | null> {
  const normalized = normalizeImageUrl(url?.trim() ?? '');
  const sid = sourceIdFrom(options);
  const key = `${cacheKey(normalized, sid)}\0${options?.bookUrl ?? ''}`;
  const existing = inflight.get(key);
  if (existing) return existing;

  const run = loadMangaImageObjectUrlInner(url, options).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, run);
  return run;
}

/** 离线缓存：将一章正文内全部插图写入磁盘（低优先级） */
export async function cacheMangaImagesFromChapterHtml(
  bookUrl: string,
  chapterIndex: number,
  html: string,
  options: {
    chapterUrl?: string;
    source?: BookSource | null;
    referer?: string | null;
  },
): Promise<number> {
  const { flowImageRefs } = await import('@/lib/media/image/flow-images');
  const refs = flowImageRefs(html, options.chapterUrl ?? '');
  let cached = 0;
  for (let pageIndex = 0; pageIndex < refs.length; pageIndex++) {
    const ref = refs[pageIndex];
    const norm = normalizeImageUrl(ref.url?.trim() ?? '');
    if (!norm || norm.startsWith('data:')) continue;
    if (
      !shouldFetchReaderInlineImageAsBlob(norm, {
        legadoImageHeaders: ref.legadoHeaders,
      })
    ) {
      continue;
    }
    if (isMangaImageLoadBlocked(norm, sourceIdFrom({ source: options.source }))) {
      continue;
    }
    const disk = await readMangaImageFromDisk(norm, sourceIdFrom({ source: options.source }));
    if (disk) {
      cached += 1;
      continue;
    }
    const url = await loadMangaImageObjectUrl(ref.url, {
      bookUrl,
      chapterIndex,
      pageIndex,
      referer: options.referer,
      source: options.source,
      legadoImageHeaders: ref.legadoHeaders,
      readerInlineQueue: true,
      readerInlineQueuePriority: 'low',
      diskOnly: true,
      persistToDisk: true,
      maxRetries: MANGA_IMAGE_DEFAULT_RETRIES,
      timeoutMs: MANGA_IMAGE_FETCH_TIMEOUT_MS,
      skipFailureGuard: true,
    });
    if (url) {
      cached += 1;
      if (!isTauri()) unlinkBlobUrl(url);
    }
  }
  return cached;
}
