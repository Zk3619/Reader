/**
 * 阿里云 WAF acw_sc__v2 质询页（蓝奏云等常见）
 * 首包为仅含 arg1 的 <script>，执行后写入 Cookie 再请求可得正文。
 */

import type { BookSource } from '@/types';
import { mergeLegadoCookieHeaderStrings } from '@/lib/js-engine/legado/normalize-legado-ajax-body';
import {
  mirrorSourceCookiesToHttpJar,
  persistSourceCookieHeaderForPage,
} from '@/lib/book-source/source-cookie-pool';
import type { AnalyzeUrlOption } from '@/lib/book-source/analyze-url-option';

/** 是否为 acw_sc__v2 质询页（非真实列表/正文） */
export function isAcwScChallengeHtml(html: string): boolean {
  const trimmed = html.trim();
  if (!trimmed || trimmed.length > 20_000) return false;
  if (!/\bvar\s+arg1\s*=/.test(trimmed)) return false;
  if (!/\bacw_sc__v2\b/.test(trimmed)) return false;
  if (/\bvar\s+pgs\b/.test(trimmed) || /#folder\b/.test(trimmed) || /filemoreajax\.php/.test(trimmed)) {
    return false;
  }
  return true;
}

/** 质询通过后是否像真实页面 */
export function looksLikeAcwScChallengeResolved(html: string): boolean {
  const trimmed = html.trim();
  if (!trimmed || isAcwScChallengeHtml(trimmed)) return false;
  return trimmed.length > 4_000;
}

/** 从 document.cookie 提取 acw_sc__v2 请求头 */
export function normalizeAcwScCookieForHeader(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/(?:^|;\s*)acw_sc__v2=([^;]+)/i);
  if (match?.[1]) return `acw_sc__v2=${match[1].trim()}`;
  const first = trimmed.split(';')[0]?.trim();
  return first ?? '';
}

export function mergeAcwCookieIntoHeaders(
  headers: Record<string, string>,
  cookiePart: string,
): Record<string, string> {
  const hdrs = { ...headers };
  const merged = mergeLegadoCookieHeaderStrings(
    String(hdrs.Cookie ?? hdrs.cookie ?? '').trim(),
    cookiePart,
  );
  if (merged) {
    hdrs.Cookie = merged;
    delete hdrs.cookie;
  }
  return hdrs;
}

/** 解质询并写入书源 Cookie 表，供后续 java.ajax 复用 */
export async function solveAndPersistAcwScCookie(
  source: BookSource,
  pageUrl: string,
  challengeHtml: string,
): Promise<string | null> {
  const solved = solveAcwScV2CookieFromHtml(challengeHtml);
  if (!solved) return null;
  const cookiePart = normalizeAcwScCookieForHeader(solved);
  if (!cookiePart) return null;
  persistSourceCookieHeaderForPage(source, pageUrl, cookiePart);
  if (source.enabledCookieJar) {
    await mirrorSourceCookiesToHttpJar(pageUrl, cookiePart);
  }
  return cookiePart;
}

/** 在浏览器/Node 中执行质询脚本，得到 document.cookie */
export function solveAcwScV2CookieFromHtml(html: string): string | null {
  const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptMatch?.[1]?.trim()) return null;
  const document = {
    cookie: '',
    location: { reload: () => {}, href: '' },
  };
  const location = document.location;
  const window = { document, location };
  try {
    // 质询脚本依赖 document / location，在严格模式下须显式注入
    const fn = new Function('document', 'window', 'location', scriptMatch[1]);
    fn(document, window, location);
  } catch {
    return null;
  }
  const cookie = document.cookie.trim();
  return cookie.includes('acw_sc__v2=') ? cookie : null;
}

export interface AcwScBypassFetchOnce {
  (
    url: string,
    option: AnalyzeUrlOption,
    headers: Record<string, string>,
    enabledCookieJar: boolean,
    timeoutMs?: number,
  ): Promise<string>;
}

/** 解质询 Cookie 并重拉页面；失败返回 null */
export async function maybeBypassAcwScChallenge(
  body: string,
  url: string,
  option: AnalyzeUrlOption,
  headers: Record<string, string>,
  enabledCookieJar: boolean,
  timeoutMs: number | undefined,
  source: BookSource | undefined,
  fetchOnce: AcwScBypassFetchOnce,
): Promise<{ body: string; url: string } | null> {
  if (!isAcwScChallengeHtml(body)) return null;

  const solved = solveAcwScV2CookieFromHtml(body);
  if (!solved) return null;

  const cookiePart = normalizeAcwScCookieForHeader(solved);
  if (!cookiePart) return null;

  const hdrs = mergeAcwCookieIntoHeaders(headers, cookiePart);

  if (source) {
    await solveAndPersistAcwScCookie(source, url, body);
  }

  try {
    const retryBody = await fetchOnce(url, option, hdrs, enabledCookieJar, timeoutMs);
    if (!looksLikeAcwScChallengeResolved(retryBody)) return null;
    return { body: retryBody, url };
  } catch {
    return null;
  }
}
