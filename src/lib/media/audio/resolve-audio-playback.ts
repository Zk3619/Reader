/**
 * 将书源正文中的音频 URL 解析为 <audio> 可播放地址（代理 / blob）
 */

import { request } from '@/lib/http';
import {
  encodeLegadoForwardHeaders,
  LEGADO_FORWARD_HEADERS_HEADER,
} from '@/lib/http/legado-forward-headers';
import { pickLegadoHeader } from '@/lib/http/legado-forward-headers';
import { toProxiedImageUrl } from '@/lib/http/proxy-image-url';
import {
  isCrossOriginHttpUrl,
  isWebHttpProxyNeeded,
  WEB_PROXY_COOKIE_HEADER,
} from '@/lib/http/web-http-proxy';
import { mergeLegadoCookieHeaderStrings } from '@/lib/js-engine/legado/normalize-legado-ajax-body';
import { buildSourceRequestHeaders } from '@/lib/book-source/source-http';
import { isTauri } from '@/lib/platform/detect';
import type { ParsedAudioUrl } from '@/lib/media/audio/parsed-audio-url';
import type { Book, BookChapter, BookSource } from '@/types';

export interface ResolvedAudioPlayback {
  src: string;
  revoke?: () => void;
}

/** 番茄 / 字节系听书 CDN，浏览器直连会 403 */
const PROTECTED_AUDIO_CDN_RE =
  /fqnovelvod\.com|snssdk\.com|byteimg\.com|ixigua\.com|bytedance\.com/i;

const TOMATO_AUDIO_REFERER = 'https://reading.snssdk.com/';

function mergeHeaders(
  source: BookSource | undefined,
  chapter: BookChapter | undefined,
  legado?: Record<string, string>,
): Record<string, string> {
  const base =
    source && chapter
      ? buildSourceRequestHeaders(source, chapter.url || source.sourceUrl)
      : source
        ? buildSourceRequestHeaders(source, source.sourceUrl)
        : {};
  return { ...base, ...(legado ?? {}) };
}

function enrichAudioFetchHeaders(
  item: ParsedAudioUrl,
  headers: Record<string, string>,
): Record<string, string> {
  const out = { ...headers };
  if (!PROTECTED_AUDIO_CDN_RE.test(item.url)) return out;
  if (!out.Referer && !out.referer) {
    out.Referer = TOMATO_AUDIO_REFERER;
  }
  return out;
}

/** 跨域或防盗链 CDN 必须经 request 拉流，不能交给 <audio src=直链> */
function mustFetchAsBlob(item: ParsedAudioUrl, headers: Record<string, string>): boolean {
  if (item.headers && Object.keys(item.headers).length > 0) return true;
  if (PROTECTED_AUDIO_CDN_RE.test(item.url)) return true;
  return isCrossOriginHttpUrl(item.url) || Boolean(headers.Cookie ?? headers.cookie);
}

function buildProxyRequestHeaders(
  item: ParsedAudioUrl,
  headers: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isTauri() && isWebHttpProxyNeeded() && isCrossOriginHttpUrl(item.url)) {
    const headerCookie = headers.Cookie ?? headers.cookie ?? '';
    const legadoCookie =
      pickLegadoHeader(item.headers, 'Cookie') ??
      pickLegadoHeader(item.headers, 'cookie') ??
      '';
    const cookie =
      headerCookie && legadoCookie
        ? mergeLegadoCookieHeaderStrings(headerCookie, legadoCookie)
        : headerCookie || legadoCookie;
    if (cookie) {
      out[WEB_PROXY_COOKIE_HEADER] = cookie;
    }
    const legadoFwd = encodeLegadoForwardHeaders({
      ...headers,
      ...(item.headers ?? {}),
    });
    if (legadoFwd) {
      out[LEGADO_FORWARD_HEADERS_HEADER] = legadoFwd;
    }
  }
  return out;
}

function isTomatoAudioCdn(url: string): boolean {
  return PROTECTED_AUDIO_CDN_RE.test(url);
}

function playbackReferer(options?: {
  source?: BookSource;
  chapter?: BookChapter;
  book?: Book;
  item: ParsedAudioUrl;
}): string | undefined {
  if (isTomatoAudioCdn(options?.item.url ?? '')) {
    return TOMATO_AUDIO_REFERER;
  }
  return options?.book?.bookUrl ?? options?.chapter?.url;
}

function proxiedUrlOptions(
  item: ParsedAudioUrl,
  headers: Record<string, string>,
  options?: {
    source?: BookSource;
    chapter?: BookChapter;
    book?: Book;
  },
) {
  const ref = playbackReferer({ ...options, item });
  return {
    source: options?.source ?? null,
    referer: ref,
    /** toProxiedImageUrl 仅在 referer 与 target 同 host 时才写入；番茄 CDN 必须强制 Referer */
    refererOverride: isTomatoAudioCdn(item.url) ? TOMATO_AUDIO_REFERER : ref,
    legadoImageHeaders: { ...headers, ...(item.headers ?? {}) },
  };
}

/** 仅同源音频可直连；跨域 Web 可走 __reader_http（仍不如 blob 稳） */
export function resolveAudioPlaybackSrc(
  item: ParsedAudioUrl,
  options?: {
    source?: BookSource;
    chapter?: BookChapter;
    book?: Book;
  },
): ResolvedAudioPlayback | null {
  if (isCrossOriginHttpUrl(item.url) && !isWebHttpProxyNeeded()) {
    return null;
  }
  const headers = mergeHeaders(options?.source, options?.chapter, item.headers);
  const proxied = toProxiedImageUrl(item.url, proxiedUrlOptions(item, headers, options));
  const src = proxied ?? item.url;
  if (isCrossOriginHttpUrl(src) && src.startsWith('http')) {
    return null;
  }
  return { src };
}

/** 经 request（+ __reader_http）拉取为 blob */
export async function fetchAudioBlobSrc(
  item: ParsedAudioUrl,
  options?: {
    source?: BookSource;
    chapter?: BookChapter;
    book?: Book;
  },
): Promise<ResolvedAudioPlayback | null> {
  const headers = enrichAudioFetchHeaders(
    item,
    mergeHeaders(options?.source, options?.chapter, item.headers),
  );
  const proxyExtra = buildProxyRequestHeaders(item, headers);

  let fetchUrl = item.url;
  if (!isTauri() && isCrossOriginHttpUrl(item.url)) {
    fetchUrl =
      toProxiedImageUrl(item.url, proxiedUrlOptions(item, headers, options)) ?? item.url;
  }

  try {
    const res = await request(fetchUrl, {
      method: 'GET',
      headers: { ...headers, ...proxyExtra },
      timeout: 120_000,
      enableCookieJar: options?.source?.enabledCookieJar ?? true,
      concurrentRate: options?.source?.concurrentRate,
    });
    if (!res.ok) {
      console.warn('[audio] 拉流 HTTP', res.status, item.url.slice(0, 80));
      return null;
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 128) {
      console.warn('[audio] 响应过短，可能非音频', buf.byteLength);
      return null;
    }
    const contentType =
      (typeof res.headers['content-type'] === 'string'
        ? res.headers['content-type']
        : '') || 'audio/mpeg';
    const blob = new Blob([buf], { type: contentType });
    const src = URL.createObjectURL(blob);
    return {
      src,
      revoke: () => URL.revokeObjectURL(src),
    };
  } catch (e) {
    console.warn('[audio] blob 拉取失败', item.url.slice(0, 96), e);
    return null;
  }
}

export async function resolveAudioPlaybackList(
  items: ParsedAudioUrl[],
  options?: {
    source?: BookSource;
    chapter?: BookChapter;
    book?: Book;
  },
): Promise<{ urls: string[]; revokeAll: () => void }> {
  const revokes: Array<() => void> = [];
  const urls: string[] = [];

  for (const item of items) {
    const headers = mergeHeaders(options?.source, options?.chapter, item.headers);
    let resolved: ResolvedAudioPlayback | null = null;

    if (mustFetchAsBlob(item, headers)) {
      resolved = await fetchAudioBlobSrc(item, options);
    }
    if (!resolved) {
      resolved = resolveAudioPlaybackSrc(item, options);
    }

    if (!resolved) {
      console.error('[audio] 无法解析可播放地址', item.url.slice(0, 120));
      continue;
    }

    if (resolved.revoke) revokes.push(resolved.revoke);
    urls.push(resolved.src);
  }

  return {
    urls,
    revokeAll: () => {
      for (const r of revokes) r();
    },
  };
}
