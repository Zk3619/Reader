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

export type BrowserFetchedImageBytes = { bytes: ArrayBuffer; mime: string };

/** CDN 防盗占位图常为极小 webp（真漫画页一般远大于此） */
export function isLikelyMangaAntiHotlinkPlaceholder(
  bytes: ArrayBuffer,
  mime: string,
): boolean {
  const n = bytes.byteLength;
  if (n === 0) return true;
  const lower = mime.toLowerCase();
  if (lower.includes('webp') || lower.includes('avif')) return n < 16_000;
  if (lower.includes('png')) return n < 12_000;
  if (lower.includes('jpeg') || lower.includes('jpg')) return n < 10_000;
  return n < 10_000;
}

async function verifyBrowserFetchedImage(
  bytes: ArrayBuffer,
  mime: string,
): Promise<boolean> {
  if (isLikelyMangaAntiHotlinkPlaceholder(bytes, mime)) return false;
  if (typeof createImageBitmap === 'undefined') return true;
  try {
    const blob = new Blob([bytes], { type: mime || 'image/webp' });
    const bmp = await createImageBitmap(blob);
    const ok = bmp.width >= 180 && bmp.height >= 180;
    bmp.close();
    return ok;
  } catch {
    return true;
  }
}

/**
 * 纯 Web：用浏览器 fetch 拉图（TLS 指纹与 Legado 客户端更接近，可设 referrer）。
 * Node __reader_http 代理易被 CF 403。
 */
export async function fetchImageBytesViaBrowser(
  url: string,
  refererOverride?: string | 'none',
): Promise<BrowserFetchedImageBytes | null> {
  if (typeof window === 'undefined' || isTauri()) return null;
  const normalized = normalizeImageUrl(url);
  if (!normalized || !/^https?:\/\//i.test(normalized)) return null;

  const init: RequestInit = {
    method: 'GET',
    mode: 'cors',
    credentials: 'omit',
    cache: 'default',
  };
  if (refererOverride === 'none') {
    init.referrerPolicy = 'no-referrer';
  } else if (refererOverride?.trim()) {
    init.referrer = refererOverride.trim();
  }

  try {
    const response = await fetch(normalized, init);
    if (!response.ok) return null;

    const ct = (response.headers.get('content-type') ?? '').toLowerCase();
    if (ct.includes('text/html')) {
      try {
        const text = await response.clone().text();
        if (looksLikeCloudflareChallengeHtml(text)) return null;
      } catch {
        return null;
      }
      return null;
    }

    const buf = await response.arrayBuffer();
    if (buf.byteLength === 0) return null;

    const mime = ct.split(';')[0]?.trim() || 'image/jpeg';
    if (!(await verifyBrowserFetchedImage(buf, mime))) return null;
    return { bytes: buf, mime };
  } catch {
    return null;
  }
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
