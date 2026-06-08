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
import {
  encodeLegadoForwardHeaders,
  pickLegadoHeader,
} from '@/lib/http/legado-forward-headers';
import { mergeLegadoCookieHeaderStrings } from '@/lib/js-engine/legado/normalize-legado-ajax-body';
import {
  LEGADO_FORWARD_HEADERS_HEADER,
  WEB_PROXY_COOKIE_HEADER,
} from '@/lib/http/web-http-proxy';
import {
  buildProxiedImageRefererAttempts,
  describeCoverRequestHeaders,
  normalizeImageUrl,
  enrichLegadoImageHeadersForFetch,
  filterProxiedImageRefererAttempts,
  resolveCoverRequestHeaders,
} from '@/lib/http/resolve-cover-referer';
import type { ImageRefererFetchContext } from '@/lib/http/resolve-cover-referer';
import {
  verifyFetchedImageBytes,
  looksLikeCloudflareChallengeHtml,
} from '@/lib/http/cf-protected-cdn';
import { toProxiedImageUrl } from '@/lib/http/proxy-image-url';
import {
  withReaderInlineImageFetchSlot,
  type ReaderInlineImageFetchPriority,
} from '@/lib/http/reader-inline-image-queue';
import { coverLoadTrace } from '@/lib/http/cover-load-trace';
import {
  canRefreshCoverUrlForBook,
  clearCoverLoadFailure,
  isCoverLoadFailureCached,
  markCoverUrlRefreshAttempted,
  registerCoverLoadAttempt,
  rememberCoverLoadFailure,
  resetCoverLoadAttempts,
} from '@/lib/http/cover-load-guard';
import type { BookSource } from '@/types';
import type { CoverCacheMeta } from '@/lib/cover/cover-disk-cache';
import { isCoverLoadScrollIdle } from '@/components/shared/virtual-list/virtual-list-scroll-coalesce';
import { parseImgRefsFromHtml } from '@/lib/media/text/reader-content-blocks';

/** Web 以内存为主；Tauri 列表滚动易触发 L1 淘汰后反复读盘（plugin-fs 桥接开销大） */
const MAX_CACHE = isTauri() ? 2048 : 128;
const cache = new Map<string, string>();
/** 按 bookUrl 索引 blob，coverUrl 键被淘汰后仍可同步 peek，避免重复 readCoverFromDisk */
const blobByBookUrl = new Map<string, string>();

/** 同一封面并发加载合并为单次网络/磁盘请求 */
const coverLoadInflight = new Map<string, Promise<string | null>>();
/** 同一 bookUrl 并发读盘合并 */
const coverDiskReadInflight = new Map<
  string,
  ReturnType<typeof readCoverFromDisk>
>();
/** 读盘未命中后短时内不再打 plugin-fs（虚拟列表 remount 风暴） */
const coverDiskMissUntil = new Map<string, number>();
/** 已确认无 cover.bin，后续不再 exists（每书 1 次 plugin 而非 N 次） */
const coverDiskKnownAbsent = new Set<string>();
const COVER_DISK_MISS_TTL_MS = isTauri() ? 300_000 : 60_000;
const MAX_COVER_DISK_CONCURRENT = isTauri() ? 2 : 6;
let coverDiskActive = 0;
const coverDiskWaiters: Array<() => void> = [];

async function withCoverDiskSlot<T>(fn: () => Promise<T>): Promise<T> {
  while (coverDiskActive >= MAX_COVER_DISK_CONCURRENT) {
    await new Promise<void>((resolve) => {
      coverDiskWaiters.push(resolve);
    });
  }
  coverDiskActive += 1;
  try {
    return await fn();
  } finally {
    coverDiskActive -= 1;
    const next = coverDiskWaiters.shift();
    if (next) next();
  }
}
/** 同一本书合并为单次 load（不同 coverUrl 也复用，避免滚动风暴） */
const coverLoadByBookUrl = new Map<string, Promise<string | null>>();

const MAX_COVER_NETWORK_CONCURRENT = 4;
let coverNetworkActive = 0;
const coverNetworkWaiters: Array<() => void> = [];

/** Tauri 下列表快滑时限制同时进行中的封面 load 条数（含读盘），避免 plugin 队列挂起 */
const MAX_COVER_LOADS_IN_FLIGHT = isTauri() ? 8 : 32;
let coverLoadsInFlight = 0;
const coverLoadSlotWaiters: Array<() => void> = [];

async function acquireCoverLoadSlot(): Promise<void> {
  if (coverLoadsInFlight < MAX_COVER_LOADS_IN_FLIGHT) {
    coverLoadsInFlight += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    coverLoadSlotWaiters.push(resolve);
  });
  coverLoadsInFlight += 1;
}

function releaseCoverLoadSlot(): void {
  coverLoadsInFlight = Math.max(0, coverLoadsInFlight - 1);
  const next = coverLoadSlotWaiters.shift();
  if (next) next();
}

async function withCoverNetworkSlot<T>(fn: () => Promise<T>): Promise<T> {
  while (coverNetworkActive >= MAX_COVER_NETWORK_CONCURRENT) {
    await new Promise<void>((resolve) => {
      coverNetworkWaiters.push(resolve);
    });
  }
  coverNetworkActive += 1;
  try {
    return await fn();
  } finally {
    coverNetworkActive -= 1;
    const next = coverNetworkWaiters.shift();
    if (next) next();
  }
}

/** 正文/漫画插图默认自动重试次数（不含首次，共 1 + N 次请求） */
export const READER_INLINE_IMAGE_DEFAULT_RETRIES = 3;

/** 正文插图重试基础间隔（毫秒），实际延迟指数退避 */
export const READER_INLINE_IMAGE_RETRY_DELAY_MS = 900;

export type CoverImageLoadOptions = {
  referer?: string | null;
  source?: BookSource | null;
  /** Legado 正文图 `url,{"headers":{...}}` 中的请求头 */
  legadoImageHeaders?: Record<string, string> | null;
  /** 用于签名封面过期时从书源刷新 thumb_url */
  bookUrl?: string | null;
  onCoverUrlRefreshed?: (newUrl: string) => void;
  /** 失败后额外重试次数（0 = 仅请求一次） */
  maxRetries?: number;
  /** 重试间隔基数（毫秒） */
  retryDelayMs?: number;
  /** 单次请求超时（毫秒） */
  timeoutMs?: number;
  /** 内部：禁止再次触发刷新，避免循环 */
  _refreshAttempted?: boolean;
  /** 内部：磁盘命中后后台更新，避免重复调度 */
  _backgroundRefreshScheduled?: boolean;
  /** 经正文插图并发池拉取（漫画 image-viewer 等） */
  readerInlineQueue?: boolean;
  /** 并发池优先级：可见页 high，章内预取 low（默认 high） */
  readerInlineQueuePriority?: ReaderInlineImageFetchPriority;
  /** 虚拟列表：跳过 L2 读盘，仅 L1 + 网络（避免 exists 风暴） */
  skipDiskRead?: boolean;
};

/** 无真实封面：占位图 URL / 空 / 未解析规则 */
export function isNoCoverImageUrl(url: string | null | undefined): boolean {
  const t = url?.trim();
  if (!t) return true;
  if (isLikelyUnresolvedRuleResult(t)) return true;
  const lower = t.toLowerCase();
  if (
    /(?:^|[/\\])(?:no[_-]?cover|default[_-]?cover|cover[_-]?default|empty)(?:\.|$)/i.test(
      lower,
    ) ||
    /(?:nocover|no-cover|default_cover|placeholder)/i.test(lower)
  ) {
    return true;
  }
  return false;
}

export {
  clearAllCoverCache,
  getCoverCacheStats,
  formatCoverCacheSize,
} from '@/lib/cover/cover-disk-cache';

function cacheKey(url: string, sourceId?: string): string {
  return `${url}\0${sourceId ?? ''}`;
}

function unlinkBlobUrl(blobUrl: string): void {
  URL.revokeObjectURL(blobUrl);
  for (const [book, url] of blobByBookUrl) {
    if (url === blobUrl) blobByBookUrl.delete(book);
  }
}

function trimCache(): void {
  while (cache.size > MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first == null) break;
    const blobUrl = cache.get(first);
    cache.delete(first);
    if (!blobUrl) continue;
    for (const [book, url] of blobByBookUrl) {
      if (url === blobUrl) blobByBookUrl.delete(book);
    }
    // Tauri 虚拟列表会反复挂载同一 bookUrl；revoke 后 peek 仍返回死链 → 海量 blob 请求
    if (!isTauri()) URL.revokeObjectURL(blobUrl);
  }
}

function blobUrlFromBytes(bytes: ArrayBuffer, mime: string): string {
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

function rememberInMemoryCache(
  key: string,
  objectUrl: string,
  bookUrl?: string | null,
): string {
  cache.set(key, objectUrl);
  const book = bookUrl?.trim();
  if (book) blobByBookUrl.set(book, objectUrl);
  trimCache();
  return objectUrl;
}

function resolveSourceId(source?: BookSource | null): string | undefined {
  return source?.sourceUrl ?? source?.sourceName;
}

function peekMemoryBlob(
  normalized: string,
  sourceId?: string,
  bookUrl?: string | null,
): string | null {
  const hit = cache.get(cacheKey(normalized, sourceId));
  if (hit) return hit;
  const book = bookUrl?.trim();
  if (!book) return null;
  const byBook = blobByBookUrl.get(book);
  if (!byBook) return null;
  rememberInMemoryCache(cacheKey(normalized, sourceId), byBook, book);
  return byBook;
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

/** Legado 正文图带 Referer / UA 等时，浏览器 <img> 直连无法携带，须走代理 */
export function hasLegadoImageFetchHeaders(
  legadoImageHeaders?: Record<string, string> | null,
): boolean {
  if (!legadoImageHeaders) return false;
  return Boolean(
    pickLegadoHeader(legadoImageHeaders, 'Referer') ||
      pickLegadoHeader(legadoImageHeaders, 'User-Agent') ||
      pickLegadoHeader(legadoImageHeaders, 'Cookie'),
  );
}

/** 正文/漫画插图是否经 fetch→blob（跨域须走 __reader_http 携带 Legado 头） */
export function shouldFetchReaderInlineImageAsBlob(
  url: string,
  options?: {
    legadoImageHeaders?: Record<string, string> | null;
    forceBlob?: boolean;
  },
): boolean {
  const normalized = normalizeImageUrl(url);
  if (!normalized || normalized.startsWith('data:')) return false;
  if (options?.forceBlob) return true;
  return shouldFetchCoverAsBlob(normalized);
}

export function shouldFetchCoverAsBlob(url: string): boolean {
  if (isLikelyUnresolvedRuleResult(url)) return false;
  return isCrossOriginCoverUrl(url);
}

/** 纯 Web：跨域且带 Legado 头的正文图须代理（浏览器无法伪造阅读页 Referer） */
export function needsWebProxiedLegadoImage(
  normalized: string,
  legadoImageHeaders?: Record<string, string> | null,
): boolean {
  return (
    !isTauri() &&
    isCrossOriginCoverUrl(normalized) &&
    hasLegadoImageFetchHeaders(legadoImageHeaders)
  );
}

export type CoverImagePeekOptions = Pick<
  CoverImageLoadOptions,
  'referer' | 'source' | 'bookUrl' | 'legadoImageHeaders'
>;

/** 同步读取 L1 内存 blob URL；虚拟列表行 remount 时避免重复拉取（含 bookUrl 二级索引） */
export function peekCoverImageObjectUrl(
  url: string,
  options?: CoverImagePeekOptions,
): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  const normalized = normalizeImageUrl(raw);
  if (
    !normalized ||
    !shouldFetchReaderInlineImageAsBlob(normalized, {
      legadoImageHeaders: options?.legadoImageHeaders,
    })
  ) {
    return null;
  }
  return peekMemoryBlob(normalized, resolveSourceId(options?.source), options?.bookUrl);
}

async function readCoverFromDiskDeduped(bookUrl: string) {
  const key = bookUrl.trim();
  if (!key) return null;

  if (coverDiskKnownAbsent.has(key)) {
    coverLoadTrace('failure-cached', { bookUrl: key, note: 'disk-absent' });
    return null;
  }

  if (isTauri() && !isCoverLoadScrollIdle()) {
    coverLoadTrace('scroll-defer', { bookUrl: key, note: 'disk-idle' });
    return null;
  }

  const missUntil = coverDiskMissUntil.get(key);
  if (missUntil && missUntil > Date.now()) {
    coverLoadTrace('failure-cached', { bookUrl: key, note: 'disk-miss-ttl' });
    return null;
  }
  if (missUntil) coverDiskMissUntil.delete(key);

  const existing = coverDiskReadInflight.get(key);
  if (existing) return existing;

  const promise = withCoverDiskSlot(() => readCoverFromDisk(key))
    .then((result) => {
      if (!result) {
        coverDiskKnownAbsent.add(key);
        coverDiskMissUntil.set(key, Date.now() + COVER_DISK_MISS_TTL_MS);
      } else {
        coverDiskKnownAbsent.delete(key);
      }
      return result;
    })
    .finally(() => {
      coverDiskReadInflight.delete(key);
    });
  coverDiskReadInflight.set(key, promise);
  return promise;
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
  const bookUrlTrim = options?.bookUrl?.trim();
  if (!options?.source || !bookUrlTrim) {
    return normalized;
  }
  const needsRefresh =
    isLikelyUnresolvedRuleResult(normalized) || isSignedImageUrlExpired(normalized);
  if (options._refreshAttempted || !needsRefresh) {
    return normalized;
  }
  if (!canRefreshCoverUrlForBook(bookUrlTrim)) {
    return normalized;
  }

  markCoverUrlRefreshAttempted(bookUrlTrim);

  coverLoadTrace('url-refresh', {
    bookUrl: bookUrlTrim,
    coverUrl: normalized,
    note: 'maybeRefreshCoverUrl',
  });

  const fresh = await refreshBookCoverUrl(options.source, bookUrlTrim);
  if (!fresh || fresh === normalized) {
    return normalized;
  }

  return normalizeImageUrl(fresh);
}

type CoverImageBytes = { bytes: ArrayBuffer; mime: string };

function applyRefererOverrideToHeaders(
  headers: Record<string, string>,
  refererOverride: string | 'none',
): void {
  if (refererOverride === 'none') {
    delete headers.Referer;
    delete headers.referer;
    delete headers.REFERER;
    delete headers.Origin;
    return;
  }
  const ref = refererOverride.trim();
  if (!ref) return;
  headers.Referer = ref;
  try {
    headers.Origin = new URL(ref).origin;
  } catch {
    delete headers.Origin;
  }
}

function describeImageFetchForLog(
  normalized: string,
  fetchUrl: string,
): { file: string; proxyTargetFile?: string; proxyTargetOk: boolean } {
  const file = normalized.split('/').pop()?.split('?')[0] ?? normalized;
  try {
    const u = new URL(fetchUrl, 'http://127.0.0.1/');
    const target = u.searchParams.get('target') ?? '';
    const proxyTargetFile = target.split('/').pop()?.split('?')[0];
    return {
      file,
      proxyTargetFile,
      proxyTargetOk: !target || target === normalized,
    };
  } catch {
    return { file, proxyTargetOk: fetchUrl === normalized };
  }
}

async function fetchCoverImageBytesOnce(
  normalized: string,
  options: CoverImageLoadOptions | undefined,
  refererOverride?: string | 'none',
): Promise<CoverImageBytes | null> {
  const opts = enrichCoverImageLoadOptions(normalized, options);
  const headers = resolveCoverRequestHeaders(
    opts?.referer,
    opts?.source,
    normalized,
    opts?.legadoImageHeaders,
  );

  if (isTauri() && refererOverride !== undefined) {
    applyRefererOverrideToHeaders(headers, refererOverride);
  }

  let fetchUrl = normalized;
  const proxyHeaders: Record<string, string> = {};

  if (!isTauri() && isCrossOriginCoverUrl(normalized)) {
    fetchUrl =
      toProxiedImageUrl(normalized, {
        referer: opts?.referer,
        source: opts?.source,
        legadoImageHeaders: opts?.legadoImageHeaders,
        refererOverride,
      }) ?? normalized;
    const headerCookie = headers.Cookie ?? headers.cookie ?? '';
    const legadoCookie =
      pickLegadoHeader(opts?.legadoImageHeaders, 'Cookie') ??
      pickLegadoHeader(opts?.legadoImageHeaders, 'cookie') ??
      '';
    const cookie =
      headerCookie && legadoCookie
        ? mergeLegadoCookieHeaderStrings(headerCookie, legadoCookie)
        : headerCookie || legadoCookie;
    if (cookie) {
      proxyHeaders[WEB_PROXY_COOKIE_HEADER] = cookie;
    }
    const legadoFwd = encodeLegadoForwardHeaders(opts?.legadoImageHeaders);
    if (legadoFwd) {
      proxyHeaders[LEGADO_FORWARD_HEADERS_HEADER] = legadoFwd;
    }
  }

  coverLoadTrace('network-fetch', {
    bookUrl: options?.bookUrl,
    coverUrl: normalized,
    note: describeImageFetchForLog(normalized, fetchUrl).file,
  });

  const response = await withCoverNetworkSlot(async () => {
    const doRequest = () =>
      request(fetchUrl, {
        method: 'GET',
        headers: isTauri() ? headers : proxyHeaders,
        allowNon2xx: true,
        timeout: options?.timeoutMs ?? 20_000,
        enableCookieJar: options?.source?.enabledCookieJar ?? false,
        concurrentRate: options?.source?.concurrentRate ?? undefined,
      });

    return options?.readerInlineQueue
      ? await withReaderInlineImageFetchSlot(
          doRequest,
          options.readerInlineQueuePriority ?? 'high',
        )
      : await doRequest();
  });

  if (!response.ok) {
    if (import.meta.env.DEV) {
      const exp = isSignedCoverUrl(normalized)
        ? isSignedImageUrlExpired(normalized)
        : false;
      const ct =
        response.headers['content-type'] ??
        response.headers['Content-Type'] ??
        '';
      let cfChallenge = false;
      if (ct.toLowerCase().includes('text/html')) {
        try {
          const text = await response.text();
          cfChallenge = looksLikeCloudflareChallengeHtml(text);
        } catch {
          /* ignore */
        }
      }
      console.warn('[cover] 加载失败', {
        status: response.status,
        signedExpired: exp,
        refererOverride: refererOverride ?? '(default)',
        cfChallenge,
        ...describeImageFetchForLog(normalized, fetchUrl),
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
  if (!(await verifyFetchedImageBytes(buf, mime))) {
    if (import.meta.env.DEV) {
      console.warn('[cover] 响应不像有效图片（空包或无法解码），继续尝试其它 Referer', {
        ...describeImageFetchForLog(normalized, fetchUrl),
        bytes: buf.byteLength,
        mime,
        refererOverride: refererOverride ?? '(default)',
      });
    }
    return null;
  }
  return { bytes: buf, mime };
}

function imageRefererFetchContext(
  options?: CoverImageLoadOptions,
): ImageRefererFetchContext {
  return { pageReferer: options?.referer };
}

function enrichCoverImageLoadOptions(
  normalized: string,
  options?: CoverImageLoadOptions,
): CoverImageLoadOptions | undefined {
  if (!options) return options;
  const legadoImageHeaders = enrichLegadoImageHeadersForFetch(
    normalized,
    options.legadoImageHeaders,
    options.referer,
  );
  if (!legadoImageHeaders) return options;
  return { ...options, legadoImageHeaders };
}

/** 跨域 Legado 正文图：__reader_http 由 Node 设置 Referer / UA（勿转发浏览器指纹头） */
async function fetchProxiedLegadoImageBytes(
  normalized: string,
  options?: CoverImageLoadOptions,
): Promise<CoverImageBytes | null> {
  const opts = enrichCoverImageLoadOptions(normalized, options);
  const refCtx = imageRefererFetchContext(opts);

  const proxyAttempts = filterProxiedImageRefererAttempts(
    buildProxiedImageRefererAttempts(
      normalized,
      opts?.legadoImageHeaders,
      refCtx,
    ),
    opts?.legadoImageHeaders,
    refCtx.pageReferer,
  );
  for (const ref of proxyAttempts) {
    const data = await fetchCoverImageBytesOnce(normalized, opts, ref);
    if (data) return data;
  }
  return null;
}

async function fetchCoverImageBytes(
  normalized: string,
  options?: CoverImageLoadOptions,
): Promise<CoverImageBytes | null> {
  if (isCrossOriginCoverUrl(normalized)) {
    if (needsWebProxiedLegadoImage(normalized, options?.legadoImageHeaders)) {
      return fetchProxiedLegadoImageBytes(normalized, options);
    }

    const refCtx = imageRefererFetchContext(options);
    const proxyAttempts = filterProxiedImageRefererAttempts(
      buildProxiedImageRefererAttempts(
        normalized,
        options?.legadoImageHeaders,
        refCtx,
      ),
      options?.legadoImageHeaders,
      refCtx.pageReferer,
    );
    for (const ref of proxyAttempts) {
      const data = await fetchCoverImageBytesOnce(normalized, options, ref);
      if (data) return data;
    }
    return null;
  }
  return fetchCoverImageBytesOnce(normalized, options);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 列表场景：仅 path 变化不算新图（避免 CDN 带参 URL 触发 disk-miss + network-fetch） */
function coverResourceKey(url: string): string {
  const n = normalizeImageUrl(url);
  if (!n || !/^https?:\/\//i.test(n)) return n;
  try {
    const u = new URL(n);
    return `${u.origin}${u.pathname}`;
  } catch {
    return n;
  }
}

function diskCoverMatchesRequest(
  disk: { bytes: ArrayBuffer; meta: CoverCacheMeta },
  normalized: string,
): boolean {
  const diskUrl = normalizeImageUrl(disk.meta.lastCoverUrl ?? '');
  if (!diskUrl || diskUrl === normalized) return true;
  if (isSignedImageUrlExpired(diskUrl) || isSignedImageUrlExpired(normalized)) {
    return false;
  }
  return coverResourceKey(diskUrl) === coverResourceKey(normalized);
}

const pendingDiskPersist = new Map<
  string,
  { coverUrl: string; bytes: ArrayBuffer; mime: string }
>();
let diskPersistFlushTimer: ReturnType<typeof setTimeout> | undefined;
const diskWriteByBook = new Map<string, Promise<void>>();

function queueDiskPersistFlushWhenIdle(): void {
  if (diskPersistFlushTimer != null) return;
  const tick = () => {
    if (!isCoverLoadScrollIdle()) {
      diskPersistFlushTimer = setTimeout(tick, 250);
      return;
    }
    diskPersistFlushTimer = undefined;
    void flushPendingDiskPersist();
  };
  diskPersistFlushTimer = setTimeout(tick, 250);
}

async function flushPendingDiskPersist(): Promise<void> {
  const batch = [...pendingDiskPersist.entries()];
  pendingDiskPersist.clear();
  const slice = isTauri() ? batch.slice(0, 4) : batch;
  if (isTauri() && batch.length > slice.length) {
    for (const [bookUrl, item] of batch.slice(slice.length)) {
      pendingDiskPersist.set(bookUrl, item);
    }
    queueDiskPersistFlushWhenIdle();
  }
  for (const [bookUrl, item] of slice) {
    const key = bookUrl.trim();
    if (!key) continue;
    const prev = diskWriteByBook.get(key);
    const run = (async () => {
      if (prev) await prev.catch(() => {});
      await writeCoverToDisk(key, item.coverUrl, item.bytes, item.mime);
    })().finally(() => {
      if (diskWriteByBook.get(key) === run) diskWriteByBook.delete(key);
    });
    diskWriteByBook.set(key, run);
    await run.catch(() => {});
  }
  if (isTauri() && pendingDiskPersist.size > 0) {
    queueDiskPersistFlushWhenIdle();
  }
}

function schedulePersistCoverToDisk(
  bookUrl: string,
  coverUrl: string,
  data: CoverImageBytes,
): void {
  const key = bookUrl.trim();
  if (!key) return;
  pendingDiskPersist.set(key, {
    coverUrl,
    bytes: data.bytes,
    mime: data.mime,
  });
  if (isTauri() && !isCoverLoadScrollIdle()) {
    coverLoadTrace('scroll-defer', {
      bookUrl: key,
      coverUrl,
      note: 'disk-write-idle',
    });
    queueDiskPersistFlushWhenIdle();
    return;
  }
  void flushPendingDiskPersist();
}

async function fetchCoverImageBytesWithRetry(
  normalized: string,
  options?: CoverImageLoadOptions,
): Promise<CoverImageBytes | null> {
  const maxRetries = Math.max(0, options?.maxRetries ?? 0);
  const baseDelay = options?.retryDelayMs ?? READER_INLINE_IMAGE_RETRY_DELAY_MS;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await sleep(baseDelay * attempt);
    }
    const data = await fetchCoverImageBytes(normalized, options);
    if (data) return data;
  }
  return null;
}

async function fetchAndCacheCover(
  normalized: string,
  options: CoverImageLoadOptions | undefined,
  memoryKey: string,
): Promise<string | null> {
  if (isTauri() && !isCoverLoadScrollIdle()) {
    coverLoadTrace('scroll-defer', {
      bookUrl: options?.bookUrl,
      coverUrl: normalized,
      note: 'network-idle',
    });
    return null;
  }

  const data =
    (options?.maxRetries ?? 0) > 0
      ? await fetchCoverImageBytesWithRetry(normalized, options)
      : await fetchCoverImageBytes(normalized, options);
  if (!data) return null;

  const objectUrl = blobUrlFromBytes(data.bytes, data.mime);
  rememberInMemoryCache(memoryKey, objectUrl, options?.bookUrl);

  const bookUrl = options?.bookUrl?.trim();
  if (bookUrl) {
    clearCoverLoadFailure(bookUrl, normalized, options?.source?.sourceUrl ?? options?.source?.sourceName);
    resetCoverLoadAttempts(bookUrl);
    schedulePersistCoverToDisk(bookUrl, normalized, data);
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
    if (!canRefreshCoverUrlForBook(bookUrl)) return;
    const fresh = await maybeRefreshCoverUrl(normalized, {
      ...options,
      _refreshAttempted: true,
    });
    if (fresh !== normalized) {
      await patchCoverDiskMetaLastUrl(bookUrl, fresh);
    }
  })().catch(() => { });
}

/**
 * 刷新本章后清除正文内联图的失败冷却与内存 blob，避免旧版校验误杀后 30 分钟内一直 failure-cached。
 */
export function clearChapterInlineImageLoadFailures(
  html: string,
  source?: BookSource | null,
): void {
  if (!html.trim()) return;
  for (const ref of parseImgRefsFromHtml(html)) {
    evictCoverImageMemoryCache(ref.url, source);
  }
}

/** 手动重试前清除内存 blob 缓存，避免沿用过期条目 */
export function evictCoverImageMemoryCache(
  url: string,
  source?: BookSource | null,
): void {
  const normalized = normalizeImageUrl(url);
  const sourceId = source?.sourceUrl ?? source?.sourceName;
  const key = cacheKey(normalized, sourceId);
  const existing = cache.get(key);
  if (existing) {
    unlinkBlobUrl(existing);
    cache.delete(key);
  }
  clearCoverLoadFailure(undefined, normalized, sourceId);
}

/** 加载失败冷却中（虚拟列表 remount 时直接走 fallback，不再请求） */
export function isCoverImageLoadBlocked(
  bookUrl: string | null | undefined,
  coverUrl: string,
  source?: BookSource | null,
): boolean {
  const normalized = normalizeImageUrl(coverUrl.trim());
  if (!normalized || !shouldFetchCoverAsBlob(normalized)) return false;
  const sourceId = source?.sourceUrl ?? source?.sourceName;
  return isCoverLoadFailureCached(bookUrl, normalized, sourceId);
}

function failCoverLoad(
  bookUrl: string | undefined,
  coverUrl: string,
  sourceId?: string,
): null {
  rememberCoverLoadFailure(bookUrl, coverUrl, sourceId);
  return null;
}

async function loadCoverImageObjectUrlInner(
  url: string,
  options?: CoverImageLoadOptions,
): Promise<string | null> {
  const initialNormalized = normalizeImageUrl(url);
  let normalized = initialNormalized;
  const sourceId = options?.source?.sourceUrl ?? options?.source?.sourceName;
  const bookUrlTrim = options?.bookUrl?.trim();

  const notifyCoverUrlIfChanged = () => {
    if (
      options?.onCoverUrlRefreshed &&
      normalized !== initialNormalized
    ) {
      options.onCoverUrlRefreshed(normalized);
    }
  };

  if (isCoverLoadFailureCached(bookUrlTrim, normalized, sourceId)) {
    coverLoadTrace('failure-cached', {
      bookUrl: bookUrlTrim,
      coverUrl: normalized,
    });
    return null;
  }

  if (isBlockedCoverUrl(normalized)) {
    normalized = await maybeRefreshCoverUrl(normalized, options);
    if (isBlockedCoverUrl(normalized)) {
      return failCoverLoad(bookUrlTrim, normalized, sourceId);
    }
  }

  const memoryKeyFor = (u: string) => cacheKey(u, sourceId);

  let key = memoryKeyFor(normalized);
  const cached = cache.get(key);
  if (cached) {
    coverLoadTrace('memory-hit', { bookUrl: bookUrlTrim, coverUrl: normalized });
    return cached;
  }

  const memoryBeforeDisk = peekMemoryBlob(normalized, sourceId, bookUrlTrim);
  if (memoryBeforeDisk) {
    coverLoadTrace('memory-hit', {
      bookUrl: bookUrlTrim,
      coverUrl: normalized,
      note: 'before disk',
    });
    return memoryBeforeDisk;
  }

  if (bookUrlTrim && !options?.skipDiskRead) {
    const disk = await readCoverFromDiskDeduped(bookUrlTrim);
    if (disk) {
      if (diskCoverMatchesRequest(disk, normalized)) {
        const objectUrl = blobUrlFromBytes(disk.bytes, disk.meta.mime);
        rememberInMemoryCache(key, objectUrl, bookUrlTrim);
        clearCoverLoadFailure(bookUrlTrim, normalized, sourceId);
        resetCoverLoadAttempts(bookUrlTrim);
        coverLoadTrace('disk-hit', { bookUrl: bookUrlTrim, coverUrl: normalized });
        notifyCoverUrlIfChanged();
        scheduleBackgroundCoverUpdate(
          bookUrlTrim,
          normalized,
          disk.meta,
          { ...options, _backgroundRefreshScheduled: true },
        );
        return objectUrl;
      }
      coverLoadTrace('disk-miss', {
        bookUrl: bookUrlTrim,
        coverUrl: normalized,
        note: 'disk url mismatch',
      });
      void deleteCoverFromDisk(bookUrlTrim).catch(() => { });
    } else {
      coverLoadTrace('disk-miss', { bookUrl: bookUrlTrim, coverUrl: normalized });
    }
  }

  normalized = await maybeRefreshCoverUrl(normalized, options);
  key = memoryKeyFor(normalized);
  const cachedAfterRefresh = cache.get(key);
  if (cachedAfterRefresh) {
    coverLoadTrace('memory-hit', {
      bookUrl: bookUrlTrim,
      coverUrl: normalized,
      note: 'after url refresh',
    });
    return cachedAfterRefresh;
  }

  try {
    let objectUrl = await fetchAndCacheCover(normalized, options, key);

    if (
      !objectUrl &&
      options?.source &&
      bookUrlTrim &&
      !options._refreshAttempted &&
      canRefreshCoverUrlForBook(bookUrlTrim) &&
      (isSignedCoverUrl(normalized) || isLikelyUnresolvedRuleResult(normalized))
    ) {
      markCoverUrlRefreshAttempted(bookUrlTrim);
      coverLoadTrace('url-refresh', {
        bookUrl: bookUrlTrim,
        coverUrl: normalized,
        note: 'refreshBookCoverUrl retry fetch',
      });
      const fresh = await refreshBookCoverUrl(options.source, bookUrlTrim);
      if (fresh && fresh !== normalized) {
        const retryUrl = normalizeImageUrl(fresh);
        objectUrl = await loadCoverImageObjectUrl(retryUrl, {
          ...options,
          _refreshAttempted: true,
        });
        if (objectUrl) {
          normalized = retryUrl;
          clearCoverLoadFailure(bookUrlTrim, retryUrl, sourceId);
          resetCoverLoadAttempts(bookUrlTrim);
          notifyCoverUrlIfChanged();
          return objectUrl;
        }
        return failCoverLoad(bookUrlTrim, retryUrl, sourceId);
      }
    }

    if (!objectUrl) {
      return failCoverLoad(bookUrlTrim, normalized, sourceId);
    }
    clearCoverLoadFailure(bookUrlTrim, normalized, sourceId);
    resetCoverLoadAttempts(bookUrlTrim);
    notifyCoverUrlIfChanged();
    return objectUrl;
  } catch {
    return failCoverLoad(bookUrlTrim, normalized, sourceId);
  }
}

/** 正文/漫画插图网络拉取（不写封面内存缓存，供 manga-image-loader 使用） */
export async function fetchReaderInlineImageBytes(
  url: string,
  options?: CoverImageLoadOptions,
): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
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
  const maxRetries = Math.max(0, options?.maxRetries ?? READER_INLINE_IMAGE_DEFAULT_RETRIES);
  return fetchCoverImageBytesWithRetry(normalized, { ...options, maxRetries });
}

export async function loadCoverImageObjectUrl(
  url: string,
  options?: CoverImageLoadOptions,
): Promise<string | null> {
  const raw = url?.trim();
  if (!raw) return null;
  let normalized = normalizeImageUrl(raw);
  if (
    !shouldFetchReaderInlineImageAsBlob(normalized, {
      legadoImageHeaders: options?.legadoImageHeaders,
    })
  ) {
    return null;
  }

  const sourceId = options?.source?.sourceUrl ?? options?.source?.sourceName;
  const bookUrlTrim = options?.bookUrl?.trim();

  if (isCoverLoadFailureCached(bookUrlTrim, normalized, sourceId)) {
    coverLoadTrace('failure-cached', { bookUrl: bookUrlTrim, coverUrl: normalized });
    return null;
  }

  const peeked = peekCoverImageObjectUrl(normalized, options);
  if (peeked) {
    coverLoadTrace('memory-hit', {
      bookUrl: bookUrlTrim,
      coverUrl: normalized,
      note: 'loadCover entry peek',
    });
    return peeked;
  }

  if (bookUrlTrim) {
    const byBook = coverLoadByBookUrl.get(bookUrlTrim);
    if (byBook) {
      coverLoadTrace('inflight-join', {
        bookUrl: bookUrlTrim,
        coverUrl: normalized,
        note: 'by-bookUrl',
      });
      return byBook;
    }
  }

  if (registerCoverLoadAttempt(bookUrlTrim, normalized, sourceId)) {
    coverLoadTrace('failure-cached', {
      bookUrl: bookUrlTrim,
      coverUrl: normalized,
      note: 'attempt-limit',
    });
    return null;
  }

  const inflightKey = `${cacheKey(normalized, sourceId)}\0${bookUrlTrim ?? ''}`;
  const existing = coverLoadInflight.get(inflightKey);
  if (existing) {
    coverLoadTrace('inflight-join', {
      bookUrl: bookUrlTrim,
      coverUrl: normalized,
    });
    return existing;
  }

  const run = (async () => {
    await acquireCoverLoadSlot();
    try {
      return await loadCoverImageObjectUrlInner(url, options);
    } finally {
      releaseCoverLoadSlot();
      coverLoadInflight.delete(inflightKey);
      if (bookUrlTrim) coverLoadByBookUrl.delete(bookUrlTrim);
    }
  })();

  if (bookUrlTrim) coverLoadByBookUrl.set(bookUrlTrim, run);
  coverLoadInflight.set(inflightKey, run);
  return run;
}
