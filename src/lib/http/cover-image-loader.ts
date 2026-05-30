/**
 * 跨域封面统一经 HTTP 拉取后转 blob URL，禁止 <img src="https://外站…"> 直连。
 * L1 内存 Map → L2 bookUrl 磁盘/IDB → L3 网络。
 */

import { refreshBookCoverUrl } from '@/lib/book-source/refresh-book-cover';
import { isLikelyUnresolvedRuleResult } from '@/lib/book-source/utils';
import {
  deleteCoverFromDisk,
  patchCoverDiskMetaLastUrl,
  readCoverFromDisk,
  writeCoverToDisk,
} from '@/lib/cover/cover-disk-cache';
import { isTauri } from '@/lib/platform/detect';
import { request } from '@/lib/http';
import {
  isSignedCoverUrl,
  isSignedImageUrlExpired,
} from '@/lib/http/signed-cover-url';
import { WEB_PROXY_COOKIE_HEADER } from '@/lib/http/web-http-proxy';
import {
  describeCoverRequestHeaders,
  normalizeImageUrl,
  resolveCoverRequestHeaders,
} from '@/lib/http/resolve-cover-referer';
import { toProxiedImageUrl } from '@/lib/http/proxy-image-url';
import type { BookSource } from '@/types';
import type { CoverCacheMeta } from '@/lib/cover/cover-disk-cache';

const MAX_CACHE = 128;
const cache = new Map<string, string>();

export type CoverImageLoadOptions = {
  referer?: string | null;
  source?: BookSource | null;
  /** 用于签名封面过期时从书源刷新 thumb_url */
  bookUrl?: string | null;
  onCoverUrlRefreshed?: (newUrl: string) => void;
  /** 内部：禁止再次触发刷新，避免循环 */
  _refreshAttempted?: boolean;
  /** 内部：磁盘命中后后台更新，避免重复调度 */
  _backgroundRefreshScheduled?: boolean;
};

export {
  clearAllCoverCache,
  getCoverCacheStats,
  formatCoverCacheSize,
} from '@/lib/cover/cover-disk-cache';

function cacheKey(url: string, sourceId?: string): string {
  return `${url}\0${sourceId ?? ''}`;
}

function trimCache(): void {
  while (cache.size > MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first == null) break;
    const blobUrl = cache.get(first);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    cache.delete(first);
  }
}

function blobUrlFromBytes(bytes: ArrayBuffer, mime: string): string {
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

function rememberInMemoryCache(key: string, objectUrl: string): string {
  cache.set(key, objectUrl);
  trimCache();
  return objectUrl;
}

export function isCrossOriginCoverUrl(url: string): boolean {
  const trimmed = normalizeImageUrl(url);
  if (!/^https?:\/\//i.test(trimmed)) return false;
  if (typeof window === 'undefined') return true;
  try {
    return new URL(trimmed).origin !== window.location.origin;
  } catch {
    return false;
  }
}

export function shouldFetchCoverAsBlob(url: string): boolean {
  if (isLikelyUnresolvedRuleResult(url)) return false;
  return isCrossOriginCoverUrl(url);
}

function isBlockedCoverUrl(url: string): boolean {
  const t = url.trim();
  if (!t || isLikelyUnresolvedRuleResult(t)) return true;
  try {
    const u = new URL(t);
    const path = u.pathname.toLowerCase();
    if (path.includes('@') && !path.match(/\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i)) {
      return true;
    }
  } catch {
    return !t.startsWith('data:');
  }
  return false;
}

async function maybeRefreshCoverUrl(
  normalized: string,
  options?: CoverImageLoadOptions,
): Promise<string> {
  if (!options?.source || !options?.bookUrl?.trim()) {
    return normalized;
  }
  const needsRefresh =
    isLikelyUnresolvedRuleResult(normalized) || isSignedImageUrlExpired(normalized);
  if (options._refreshAttempted || !needsRefresh) {
    return normalized;
  }

  const fresh = await refreshBookCoverUrl(
    options.source,
    options.bookUrl.trim(),
  );
  if (!fresh || fresh === normalized) {
    return normalized;
  }

  options.onCoverUrlRefreshed?.(fresh);
  return normalizeImageUrl(fresh);
}

type CoverImageBytes = { bytes: ArrayBuffer; mime: string };

async function fetchCoverImageBytes(
  normalized: string,
  options?: CoverImageLoadOptions,
): Promise<CoverImageBytes | null> {
  const headers = resolveCoverRequestHeaders(
    options?.referer,
    options?.source,
    normalized,
  );

  let fetchUrl = normalized;
  const proxyHeaders: Record<string, string> = {};

  if (!isTauri() && isCrossOriginCoverUrl(normalized)) {
    fetchUrl =
      toProxiedImageUrl(normalized, {
        referer: headers.Referer ?? options?.referer,
        source: options?.source,
      }) ?? normalized;
    const cookie = headers.Cookie ?? headers.cookie;
    if (cookie) {
      proxyHeaders[WEB_PROXY_COOKIE_HEADER] = cookie;
    }
  }

  const response = await request(fetchUrl, {
    method: 'GET',
    headers: isTauri() ? headers : proxyHeaders,
    allowNon2xx: true,
    timeout: 20000,
    enableCookieJar: options?.source?.enabledCookieJar ?? false,
  });

  if (!response.ok) {
    if (import.meta.env.DEV) {
      const exp = isSignedCoverUrl(normalized)
        ? isSignedImageUrlExpired(normalized)
        : false;
      console.warn('[cover] 加载失败', {
        status: response.status,
        url: normalized.slice(0, 96),
        signedExpired: exp,
        ...describeCoverRequestHeaders(headers),
      });
    }
    return null;
  }

  const contentType =
    response.headers['content-type'] ??
    response.headers['Content-Type'] ??
    '';
  if (contentType.toLowerCase().includes('text/html')) {
    return null;
  }

  const buf = await response.arrayBuffer();
  if (buf.byteLength === 0) return null;

  const mime = contentType.split(';')[0]?.trim() || 'image/jpeg';
  return { bytes: buf, mime };
}

async function persistCoverToDisk(
  bookUrl: string,
  coverUrl: string,
  data: CoverImageBytes,
): Promise<void> {
  try {
    await writeCoverToDisk(bookUrl, coverUrl, data.bytes, data.mime);
  } catch {
    /* 写入失败不影响展示 */
  }
}

async function fetchAndCacheCover(
  normalized: string,
  options: CoverImageLoadOptions | undefined,
  memoryKey: string,
): Promise<string | null> {
  const data = await fetchCoverImageBytes(normalized, options);
  if (!data) return null;

  const objectUrl = blobUrlFromBytes(data.bytes, data.mime);
  rememberInMemoryCache(memoryKey, objectUrl);

  const bookUrl = options?.bookUrl?.trim();
  if (bookUrl) {
    void persistCoverToDisk(bookUrl, normalized, data);
  }

  return objectUrl;
}

/** 磁盘命中后：签名过期时仅刷新书源 thumb_url，不再次 download_binary */
function scheduleBackgroundCoverUpdate(
  bookUrl: string,
  normalized: string,
  _diskMeta: CoverCacheMeta,
  options: CoverImageLoadOptions | undefined,
): void {
  if (options?._backgroundRefreshScheduled) return;
  if (!options?.source || !options.bookUrl?.trim()) return;
  if (!isSignedCoverUrl(normalized) || !isSignedImageUrlExpired(normalized)) {
    return;
  }

  void (async () => {
    const fresh = await maybeRefreshCoverUrl(normalized, {
      ...options,
      _refreshAttempted: false,
    });
    if (fresh !== normalized) {
      await patchCoverDiskMetaLastUrl(bookUrl, fresh);
    }
  })().catch(() => {});
}

export async function loadCoverImageObjectUrl(
  url: string,
  options?: CoverImageLoadOptions,
): Promise<string | null> {
  let normalized = normalizeImageUrl(url);
  if (isBlockedCoverUrl(normalized)) {
    normalized = await maybeRefreshCoverUrl(normalized, options);
    if (isBlockedCoverUrl(normalized)) return null;
  }
  const sourceId = options?.source?.sourceUrl ?? options?.source?.sourceName;
  const bookUrlTrim = options?.bookUrl?.trim();

  const memoryKeyFor = (u: string) => cacheKey(u, sourceId);

  let key = memoryKeyFor(normalized);
  const cached = cache.get(key);
  if (cached) return cached;

  if (bookUrlTrim) {
    const disk = await readCoverFromDisk(bookUrlTrim);
    if (disk) {
      const diskUrl = normalizeImageUrl(disk.meta.lastCoverUrl ?? '');
      const urlMatches = !diskUrl || diskUrl === normalized;
      if (urlMatches) {
        const objectUrl = blobUrlFromBytes(disk.bytes, disk.meta.mime);
        rememberInMemoryCache(key, objectUrl);
        scheduleBackgroundCoverUpdate(
          bookUrlTrim,
          normalized,
          disk.meta,
          { ...options, _backgroundRefreshScheduled: true },
        );
        return objectUrl;
      }
      void deleteCoverFromDisk(bookUrlTrim).catch(() => {});
    }
  }

  normalized = await maybeRefreshCoverUrl(normalized, options);
  key = memoryKeyFor(normalized);
  const cachedAfterRefresh = cache.get(key);
  if (cachedAfterRefresh) return cachedAfterRefresh;

  try {
    let objectUrl = await fetchAndCacheCover(normalized, options, key);

    if (
      !objectUrl &&
      options?.source &&
      bookUrlTrim &&
      !options._refreshAttempted &&
      (isSignedCoverUrl(normalized) || isLikelyUnresolvedRuleResult(normalized))
    ) {
      const fresh = await refreshBookCoverUrl(options.source, bookUrlTrim);
      if (fresh && fresh !== normalized) {
        options.onCoverUrlRefreshed?.(fresh);
        const retryUrl = normalizeImageUrl(fresh);
        objectUrl = await loadCoverImageObjectUrl(retryUrl, {
          ...options,
          _refreshAttempted: true,
        });
        return objectUrl;
      }
    }

    return objectUrl;
  } catch {
    return null;
  }
}
