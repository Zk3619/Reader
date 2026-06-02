/**
 * 封面请求 Referer / Cookie：与探索列表一致使用书源登录态；
 * 勿把书源 header 里给其它站点的 Referer（如 banzhu）或聚合站 qttoken 套到第三方 CDN。
 */

import type { BookSource } from '@/types';
import { parseHeaders } from '@/lib/book-source/utils';
import { parseLegadoUrlWithOptions } from '@/lib/js-engine/legado/parse-legado-url-options';
import {
  cookieStorageKeyToOrigin,
  getStoredSourceCookiesForCover,
  readSourceCookieStore,
} from '@/lib/js-engine';
import {
  firstHostFromJsLib,
  getScriptBaseUrl,
  getSourceArgsKey,
} from '@/lib/js-engine/legado/source-script-shared';
import { buildSourceRequestHeaders } from '@/lib/book-source/source-http';

/** 规范化封面地址（协议相对 //…；剥离 Legado ,{"headers":…} 后缀） */
export function normalizeImageUrl(url: string): string {
  const { url: bare } = parseLegadoUrlWithOptions(url.trim());
  const trimmed = bare.trim();
  if (trimmed.startsWith('//') && typeof window !== 'undefined') {
    return `${window.location.protocol}${trimmed}`;
  }
  return trimmed;
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

function isPlaceholderCookie(value: string | undefined): boolean {
  const v = (value ?? '').trim();
  return v === '1' || v === '"1"';
}

function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

/** 图片 URL 与 Referer 是否跨站（CDN 图常因错误 Referer 返回 403/防盗图） */
export function isCrossOriginImageReferer(
  imageUrl: string,
  referer?: string | null,
): boolean {
  if (!referer?.trim()) return false;
  const coverHost = hostnameOf(normalizeImageUrl(imageUrl));
  const refHost = hostnameOf(referer.trim());
  return Boolean(coverHost && refHost && coverHost !== refHost);
}

/** 正文插图原始 Referer（Legado 每图 headers，可为跨站阅读页） */
export function resolveInlineImageReferer(
  _imageUrl: string,
  legadoHeaders?: Record<string, string> | null,
): string | undefined {
  if (!legadoHeaders) return undefined;
  const legadoRef =
    legadoHeaders.Referer ??
    legadoHeaders.referer ??
    legadoHeaders.REFERER;
  return legadoRef?.trim() || undefined;
}

/** Web 代理默认 Referer：Legado 指定 → 章节页 → 图床同源 */
export function resolveProxiedImageReferer(
  imageUrl: string,
  legadoHeaders?: Record<string, string> | null,
  pageReferer?: string | null,
): string | undefined {
  const normalized = normalizeImageUrl(imageUrl);
  const legadoRef = resolveInlineImageReferer(normalized, legadoHeaders);
  if (legadoRef) return legadoRef;
  const page = normalizeHttpReferer(pageReferer);
  if (page) return page;
  return cdnOriginReferer(normalized);
}

export type ProxiedRefererAttempt = string | 'none';

/** 章节页 / 书籍 origin：Legado 图未带 Referer 时补全阅读页 referrer */
export type ImageRefererFetchContext = {
  pageReferer?: string | null;
};

export function normalizeHttpReferer(value?: string | null): string | undefined {
  const t = value?.trim();
  if (!t || !/^https?:\/\//i.test(t)) return undefined;
  return t;
}

/** 正文图无 Legado Referer 时，用章节页 URL 补全（避免被剥成 CDN 同源后出防盗图） */
export function enrichLegadoImageHeadersForFetch(
  imageUrl: string,
  legadoHeaders?: Record<string, string> | null,
  pageReferer?: string | null,
): Record<string, string> | null {
  const page = normalizeHttpReferer(pageReferer);
  const base = legadoHeaders ? { ...legadoHeaders } : page ? {} : null;
  if (!base) return null;
  if (!resolveInlineImageReferer(imageUrl, base) && page) {
    base.Referer = page;
  }
  return Object.keys(base).length > 0 ? base : null;
}

function cdnOriginReferer(imageUrl: string): string | undefined {
  try {
    return `${new URL(normalizeImageUrl(imageUrl)).origin}/`;
  } catch {
    return undefined;
  }
}

/** 代理 / 浏览器按序尝试的 Referer（Legado 指定 → 章节页 → 图床同源） */
export function buildProxiedImageRefererAttempts(
  imageUrl: string,
  legadoHeaders?: Record<string, string> | null,
  ctx?: ImageRefererFetchContext,
): ProxiedRefererAttempt[] {
  const normalized = normalizeImageUrl(imageUrl);
  const legadoRef = resolveInlineImageReferer(normalized, legadoHeaders);
  const pageRef = normalizeHttpReferer(ctx?.pageReferer);
  const cdn = cdnOriginReferer(normalized);
  const attempts: ProxiedRefererAttempt[] = [];
  const add = (v: ProxiedRefererAttempt) => {
    if (!attempts.includes(v)) attempts.push(v);
  };

  if (legadoRef) add(legadoRef);
  if (pageRef && pageRef !== legadoRef) add(pageRef);
  if (cdn && cdn !== legadoRef && cdn !== pageRef) add(cdn);
  add('none');
  return attempts;
}

/** 有阅读页 / Legado Referer 时勿试 referer=none */
export function filterProxiedImageRefererAttempts(
  attempts: ProxiedRefererAttempt[],
  legadoHeaders?: Record<string, string> | null,
  pageReferer?: string | null,
): ProxiedRefererAttempt[] {
  const hasCustomRef = Boolean(
    resolveInlineImageReferer('', legadoHeaders) ||
      normalizeHttpReferer(pageReferer),
  );
  if (!hasCustomRef) return attempts;
  const filtered = attempts.filter((a) => a !== 'none');
  return filtered.length > 0 ? filtered : attempts;
}

function readSourceArgs(source: BookSource): Record<string, unknown> | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(getSourceArgsKey(source));
    if (!raw) return undefined;
    const data = JSON.parse(raw) as Record<string, unknown>;
    return data && typeof data === 'object' ? data : undefined;
  } catch {
    return undefined;
  }
}

function readServerFromSourceArgs(source: BookSource): string | undefined {
  const data = readSourceArgs(source);
  const server = data?.server;
  if (typeof server === 'string' && isHttpUrl(server)) {
    return server.endsWith('/') ? server : `${server}/`;
  }
  return undefined;
}

/** 书源变量 sources（如「番茄」），与 shareBookSource exploreUrl 一致 */
function readSourcesFromSourceArgs(source: BookSource): string | undefined {
  const v = readSourceArgs(source)?.sources;
  return typeof v === 'string' ? v : undefined;
}

/**
 * thumb_url 等读者端 CDN：封面 host 与聚合 server 不同时，用番茄登录域 Referer（Legado getFanqieCookie）。
 */
function readerRefererWhenCoverOffServer(
  source: BookSource,
  coverUrl: string,
): string | undefined {
  const normalized = normalizeImageUrl(coverUrl);
  const coverHost = hostnameOf(normalized);
  const serverHost = hostnameOf(readServerFromSourceArgs(source) ?? '');
  if (!coverHost || !serverHost || coverHost === serverHost) {
    return undefined;
  }

  const sources = readSourcesFromSourceArgs(source);
  if (sources && /番茄|全部/.test(sources)) {
    return 'https://fanqienovel.com/';
  }

  return undefined;
}

function refererFromSourceBase(source: BookSource): string | undefined {
  const fromArgs = readServerFromSourceArgs(source);
  if (fromArgs) return fromArgs;

  try {
    const base = getScriptBaseUrl(source);
    if (base && isHttpUrl(base)) {
      return base.endsWith('/') ? base : `${base}/`;
    }
  } catch {
    /* ignore */
  }

  const fromJs = firstHostFromJsLib(source.jsLib);
  if (fromJs) return fromJs.endsWith('/') ? fromJs : `${fromJs}/`;

  return undefined;
}

/** 优先含 sessionid 的登录域 Referer（与 Legado getFanqieCookie 一致） */
function refererFromSourceCookieStore(
  source: BookSource,
  coverUrl: string,
): string | undefined {
  const coverHost = hostnameOf(normalizeImageUrl(coverUrl));
  if (!coverHost) return undefined;

  const store = readSourceCookieStore(source);

  for (const [key, val] of store) {
    if (!val?.trim()) continue;
    const origin = cookieStorageKeyToOrigin(key);
    if (!origin) continue;
    try {
      if (new URL(origin).hostname === coverHost) continue;
    } catch {
      continue;
    }
    if (/sessionid=/i.test(val)) {
      return origin;
    }
  }

  const bare = store.get('fanqienovel.com')?.trim();
  if (bare && /sessionid=/i.test(bare)) {
    return 'https://fanqienovel.com/';
  }

  return undefined;
}

/**
 * 解析封面请求的 Referer（不绑定特定图床域名）。
 */
export function resolveCoverReferer(
  bookOrigin?: string | null,
  source?: BookSource | null,
  coverUrl?: string | null,
): string | undefined {
  if (bookOrigin?.trim() && isHttpUrl(bookOrigin)) {
    try {
      return new URL(bookOrigin.trim()).href;
    } catch {
      /* fall through */
    }
  }

  if (source && coverUrl?.trim()) {
    const normalized = normalizeImageUrl(coverUrl);
    const fromCookies = refererFromSourceCookieStore(source, normalized);
    if (fromCookies) return fromCookies;

    const fromReader = readerRefererWhenCoverOffServer(source, normalized);
    if (fromReader) return fromReader;

    const coverHost = hostnameOf(normalized);
    const serverHost = hostnameOf(readServerFromSourceArgs(source) ?? '');
    if (coverHost && serverHost && coverHost !== serverHost) {
      return undefined;
    }
  }

  if (source) {
    return refererFromSourceBase(source);
  }

  return undefined;
}

export function resolveCoverRequestHeaders(
  bookOrigin?: string | null,
  source?: BookSource | null,
  coverUrl?: string | null,
  extraHeaders?: Record<string, string> | null,
): Record<string, string> {
  const normalizedCover = coverUrl?.trim()
    ? normalizeImageUrl(coverUrl)
    : '';
  const parsed =
    source && normalizedCover.startsWith('http')
      ? buildSourceRequestHeaders(source, normalizedCover)
      : parseHeaders(source?.header);
  const headers: Record<string, string> = { ...parsed };

  const headerReferer =
    headers.Referer ?? headers.referer ?? headers.REFERER;
  const headerCookie = headers.Cookie ?? headers.cookie;

  delete headers.Referer;
  delete headers.referer;
  delete headers.REFERER;
  if (isPlaceholderCookie(headerCookie)) {
    delete headers.Cookie;
    delete headers.cookie;
  }

  const explicitPageReferer = normalizeHttpReferer(bookOrigin);

  let referer = resolveCoverReferer(bookOrigin, source, normalizedCover || null);
  if (explicitPageReferer && normalizedCover.startsWith('http')) {
    referer = explicitPageReferer;
  }
  if (headerReferer?.trim() && normalizedCover.startsWith('http')) {
    const h = hostnameOf(headerReferer.trim());
    const c = hostnameOf(normalizedCover);
    if (h && c && h === c) {
      referer = headerReferer.trim();
    }
  }

  if (referer) {
    headers.Referer = referer;
    try {
      headers.Origin = new URL(referer).origin;
    } catch {
      /* ignore */
    }
  }

  if (source && normalizedCover.startsWith('http')) {
    const cookieHeader = getStoredSourceCookiesForCover(source, normalizedCover);
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }
  }

  const legadoReferer =
    extraHeaders?.Referer ??
    extraHeaders?.referer ??
    extraHeaders?.REFERER;

  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      if (v?.trim()) headers[k] = v.trim();
    }
  }

  if (normalizedCover.startsWith('http') && !legadoReferer?.trim()) {
    if (
      explicitPageReferer &&
      isCrossOriginImageReferer(normalizedCover, explicitPageReferer)
    ) {
      headers.Referer = explicitPageReferer;
      try {
        headers.Origin = new URL(explicitPageReferer).origin;
      } catch {
        /* ignore */
      }
    } else {
      const ref = headers.Referer ?? headers.referer ?? headers.REFERER;
      if (isCrossOriginImageReferer(normalizedCover, ref)) {
        delete headers.Referer;
        delete headers.referer;
        delete headers.REFERER;
        delete headers.Origin;
      }
      if (!headers.Referer && !headers.referer && !headers.REFERER) {
        const cdnOrigin = cdnOriginReferer(normalizedCover);
        if (cdnOrigin) {
          headers.Referer = cdnOrigin;
          try {
            headers.Origin = new URL(normalizedCover).origin;
          } catch {
            /* ignore */
          }
        }
      }
    }
  }

  return headers;
}

/** 开发调试：只输出 Referer 主机名与 Cookie 名，不含敏感值 */
export function describeCoverRequestHeaders(
  headers: Record<string, string>,
): { refererHost?: string; cookieNames: string[] } {
  const referer = headers.Referer ?? headers.referer;
  let refererHost: string | undefined;
  if (referer) {
    try {
      refererHost = new URL(referer).hostname;
    } catch {
      refererHost = referer.slice(0, 40);
    }
  }
  const cookie = headers.Cookie ?? headers.cookie ?? '';
  const cookieNames = cookie
    .split(';')
    .map((p) => p.trim().split('=')[0])
    .filter(Boolean);
  return { refererHost, cookieNames };
}
