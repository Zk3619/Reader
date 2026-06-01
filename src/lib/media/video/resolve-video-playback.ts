/**
 * 将书源正文中的视频 URL 解析为 <video> 可播放地址（同源代理 / blob）
 * 对齐 Legado VideoPlay + AnalyzeUrl；视频不走整段 blob 拉流（体积过大）
 */

import { buildSourceRequestHeaders } from '@/lib/book-source/source-http';
import { toProxiedImageUrl } from '@/lib/http/proxy-image-url';
import { isCrossOriginHttpUrl, isWebHttpProxyNeeded } from '@/lib/http/web-http-proxy';
import { isTauri } from '@/lib/platform/detect';
import type { ParsedVideoUrl } from '@/lib/media/video/parsed-video-url';
import type { Book, BookChapter, BookSource } from '@/types';

export interface ResolvedVideoPlayback {
  src: string;
  revoke?: () => void;
}

const PROTECTED_VIDEO_CDN_RE =
  /fqnovelvod\.com|snssdk\.com|byteimg\.com|ixigua\.com|bytedance\.com|douyinvod/i;

const TOMATO_VIDEO_REFERER = 'https://reading.snssdk.com/';

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

function enrichVideoFetchHeaders(
  item: ParsedVideoUrl,
  headers: Record<string, string>,
): Record<string, string> {
  const out = { ...headers };
  if (!PROTECTED_VIDEO_CDN_RE.test(item.url)) return out;
  if (!out.Referer && !out.referer) {
    out.Referer = TOMATO_VIDEO_REFERER;
  }
  return out;
}

function isTomatoVideoCdn(url: string): boolean {
  return PROTECTED_VIDEO_CDN_RE.test(url);
}

function playbackReferer(options?: {
  source?: BookSource;
  chapter?: BookChapter;
  book?: Book;
  item: ParsedVideoUrl;
}): string | undefined {
  if (isTomatoVideoCdn(options?.item.url ?? '')) {
    return TOMATO_VIDEO_REFERER;
  }
  return options?.book?.bookUrl ?? options?.chapter?.url;
}

function proxiedUrlOptions(
  item: ParsedVideoUrl,
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
    refererOverride: isTomatoVideoCdn(item.url) ? TOMATO_VIDEO_REFERER : ref,
    legadoImageHeaders: { ...headers, ...(item.headers ?? {}) },
  };
}

/** 跨域或带 Cookie/headers 时须走同源 __reader_http，<video> 无法自定义请求头 */
export function mustProxyVideo(item: ParsedVideoUrl, headers: Record<string, string>): boolean {
  if (item.headers && Object.keys(item.headers).length > 0) return true;
  if (PROTECTED_VIDEO_CDN_RE.test(item.url)) return true;
  if (item.url.includes('.m3u8')) return true;
  return isCrossOriginHttpUrl(item.url) || Boolean(headers.Cookie ?? headers.cookie);
}

export function resolveVideoPlaybackSrc(
  item: ParsedVideoUrl,
  options?: {
    source?: BookSource;
    chapter?: BookChapter;
    book?: Book;
  },
): ResolvedVideoPlayback | null {
  if (item.url.startsWith('blob:') || item.url.startsWith('data:')) {
    return { src: item.url };
  }
  if (isCrossOriginHttpUrl(item.url) && !isWebHttpProxyNeeded() && !isTauri()) {
    return null;
  }
  const headers = enrichVideoFetchHeaders(
    item,
    mergeHeaders(options?.source, options?.chapter, item.headers),
  );
  const proxied = toProxiedImageUrl(item.url, proxiedUrlOptions(item, headers, options));
  const src = proxied ?? item.url;
  if (!isTauri() && isCrossOriginHttpUrl(src) && src.startsWith('http')) {
    return null;
  }
  return { src };
}

export async function resolveVideoPlaybackList(
  items: ParsedVideoUrl[],
  options?: {
    source?: BookSource;
    chapter?: BookChapter;
    book?: Book;
  },
): Promise<{ urls: string[]; revokeAll: () => void }> {
  const revokes: Array<() => void> = [];
  const urls: string[] = [];

  for (const item of items) {
    const resolved = resolveVideoPlaybackSrc(item, options);
    if (!resolved) {
      console.error('[video] 无法解析可播放地址', item.url.slice(0, 120));
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
