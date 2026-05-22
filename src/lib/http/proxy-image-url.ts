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
import { normalizeImageUrl, resolveCoverReferer } from '@/lib/http/resolve-cover-referer';

const NON_PROXY_SCHEMES = /^(data:|blob:|javascript:|file:|about:)/i;

export type ProxiedImageUrlOptions = {
  referer?: string | null;
  source?: BookSource | null;
};

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
  const referer =
    (options?.referer?.trim() && /^https?:\/\//i.test(options.referer.trim())
      ? options.referer.trim()
      : undefined) ??
    resolveCoverReferer(options?.referer, options?.source ?? null, trimmed);
  if (referer) {
    params.set('referer', referer);
  }
  return `${proxyPath}?${params.toString()}`;
}

export { normalizeImageUrl } from '@/lib/http/resolve-cover-referer';
