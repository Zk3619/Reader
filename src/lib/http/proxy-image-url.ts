/**
 * 纯 Web 下将跨域 http(s) 封面改写为同源 __reader_http，避免 CORB 与 CDN 防盗链（403）。
 */

import type { BookSource } from '@/types';
import {
  isCrossOriginHttpUrl,
  isReaderHttpProxyUrl,
  isWebHttpProxyNeeded,
  resolveWebHttpProxyPath,
} from '@/lib/http/web-http-proxy';
import { pickLegadoHeader } from '@/lib/http/legado-forward-headers';
import {
  normalizeImageUrl,
  resolveCoverReferer,
  resolveProxiedImageReferer,
} from '@/lib/http/resolve-cover-referer';

const NON_PROXY_SCHEMES = /^(data:|blob:|javascript:|file:|about:)/i;

export type ProxiedImageUrlOptions = {
  referer?: string | null;
  source?: BookSource | null;
  /** Legado 正文图 `data-legado-headers` / URL 后缀中的请求头 */
  legadoImageHeaders?: Record<string, string> | null;
  /** 强制 Referer（403 重试）；`none` = 不传 Referer */
  refererOverride?: string | 'none' | null;
};

function isImageResourceUrl(url: string): boolean {
  return /\.(?:webp|jpe?g|png|gif|avif|bmp|svg)(?:\?|#|$)/i.test(url);
}

function isAlreadyProxied(url: string): boolean {
  return isReaderHttpProxyUrl(url);
}

/**
 * 在 Web 环境下把跨域封面 URL 改写为同源代理地址。
 * 跨域封面由 cover-image-loader 拉取为 blob；此处仅供 Web 代理 URL 拼装。
 */
export function toProxiedImageUrl(
  url: string | undefined | null,
  options?: ProxiedImageUrlOptions,
): string | undefined {
  if (url == null) return undefined;
  const trimmed = normalizeImageUrl(url);
  if (!trimmed || NON_PROXY_SCHEMES.test(trimmed) || isAlreadyProxied(trimmed)) {
    return trimmed || undefined;
  }
  if (!isWebHttpProxyNeeded() || !isCrossOriginHttpUrl(trimmed)) {
    return trimmed;
  }
  const proxyPath = resolveWebHttpProxyPath();
  const params = new URLSearchParams({ target: trimmed });

  const legadoUa = pickLegadoHeader(options?.legadoImageHeaders, 'User-Agent');

  if (options?.refererOverride !== undefined && options.refererOverride !== null) {
    if (options.refererOverride === 'none') {
      params.set('referer', 'none');
    } else if (options.refererOverride.trim()) {
      params.set('referer', options.refererOverride.trim());
    }
  } else {
    const proxiedReferer = resolveProxiedImageReferer(
      trimmed,
      options?.legadoImageHeaders,
    );
    if (proxiedReferer) {
      params.set('referer', proxiedReferer);
    } else {
      const resolvedReferer =
        (options?.referer?.trim() && /^https?:\/\//i.test(options.referer.trim())
          ? options.referer.trim()
          : undefined) ??
        resolveCoverReferer(options?.referer, options?.source ?? null, trimmed);
      if (resolvedReferer) {
        try {
          const sameHost =
            new URL(resolvedReferer).hostname === new URL(trimmed).hostname;
          if (sameHost) {
            params.set('referer', resolvedReferer);
          }
        } catch {
          /* ignore */
        }
      }
      if (isImageResourceUrl(trimmed) && !params.has('referer')) {
        try {
          params.set('referer', `${new URL(trimmed).origin}/`);
        } catch {
          params.set('referer', 'none');
        }
      }
    }
  }

  if (legadoUa) {
    params.set('userAgent', legadoUa);
  }

  return `${proxyPath}?${params.toString()}`;
}

export { normalizeImageUrl } from '@/lib/http/resolve-cover-referer';
