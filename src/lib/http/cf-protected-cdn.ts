/**
 * Cloudflare 等 CDN：Node/Vite 代理易被识别为机器人；浏览器直连 TLS 指纹不同。
 */

import { normalizeImageUrl } from '@/lib/http/resolve-cover-referer';
import { isTauri } from '@/lib/platform/detect';

/** 已知走 CF / 对 Node fetch 极不友好的图床域名（可逐步扩展） */
const CF_HEAVY_HOST_PATTERNS: RegExp[] = [
  /\.g-mh\.online$/i,
  /^f\d+-\d+-\d+\.g-mh\.online$/i,
];

export function isCloudflareHeavyCdnHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  if (!h) return false;
  return CF_HEAVY_HOST_PATTERNS.some((re) => re.test(h));
}

export function isCloudflareHeavyCdnUrl(url: string): boolean {
  try {
    return isCloudflareHeavyCdnHost(new URL(normalizeImageUrl(url)).hostname);
  } catch {
    return false;
  }
}

/**
 * 纯 Web：优先用浏览器 <img> 直连 CDN（不经 Node __reader_http），避免 CF 把挑战页
 * 重定向成 localhost 相对路径；失败后再走 blob + 代理。
 */
export function shouldPreferDirectBrowserImage(url: string): boolean {
  if (isTauri() || typeof window === 'undefined') return false;
  return isCloudflareHeavyCdnUrl(url);
}

export function resolveDirectBrowserImageReferrerPolicy(
  legadoHeaders?: Record<string, string> | null,
): 'no-referrer' | undefined {
  const ref =
    legadoHeaders?.Referer ??
    legadoHeaders?.referer ??
    legadoHeaders?.REFERER;
  if (ref?.trim() && /^https?:\/\//i.test(ref.trim())) {
    // 浏览器无法为 <img> 指定任意 Referer，仅能弱化或省略
    return 'no-referrer';
  }
  return 'no-referrer';
}

/** 响应体是否为 Cloudflare 人机挑战页（非图片） */
export function looksLikeCloudflareChallengeHtml(
  snippet: string,
): boolean {
  const s = snippet.slice(0, 2048).toLowerCase();
  return (
    s.includes('just a moment') ||
    s.includes('cf-chl') ||
    s.includes('challenge-platform') ||
    s.includes('cloudflare')
  );
}
