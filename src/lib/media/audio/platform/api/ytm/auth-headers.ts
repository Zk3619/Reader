/**
 * YouTube Music Cookie → SAPISIDHASH Authorization
 */

import CryptoJS from 'crypto-js';

export const YTM_ORIGIN = 'https://music.youtube.com';
export const YTM_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export function parseCookieMap(cookieHeader: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

function firstCookie(map: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = map[k];
    if (v?.trim()) return v.trim();
  }
  return undefined;
}

/** SHA1(`${ts} ${sid} ${origin}`) → `SCHEME ts_digest` */
export function buildSidAuthorization(
  scheme: string,
  sid: string,
  origin: string,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
): string {
  const digest = CryptoJS.SHA1(`${nowEpochSeconds} ${sid} ${origin}`).toString();
  return `${scheme} ${nowEpochSeconds}_${digest}`;
}

export function resolveSapisidAuthorization(
  cookieHeader: string,
  origin = YTM_ORIGIN,
): string {
  const map = parseCookieMap(cookieHeader);
  const parts: string[] = [];
  const sapisid = firstCookie(map, ['SAPISID', '__Secure-3PAPISID', '__Secure-1PAPISID', 'APISID']);
  const sapisid1 = firstCookie(map, ['__Secure-1PAPISID']);
  const sapisid3 = firstCookie(map, ['__Secure-3PAPISID']);
  if (sapisid) parts.push(buildSidAuthorization('SAPISIDHASH', sapisid, origin));
  if (sapisid1) parts.push(buildSidAuthorization('SAPISID1PHASH', sapisid1, origin));
  if (sapisid3) parts.push(buildSidAuthorization('SAPISID3PHASH', sapisid3, origin));
  return parts.join(' ');
}

export function buildInnertubeHeaders(cookieHeader?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': YTM_UA,
    Origin: YTM_ORIGIN,
    Referer: `${YTM_ORIGIN}/`,
    'X-Goog-AuthUser': '0',
    'X-Youtube-Client-Name': '67',
    'X-Youtube-Client-Version': '1.20250310.01.00',
  };
  if (cookieHeader?.trim()) {
    headers.Cookie = cookieHeader.trim();
    const auth = resolveSapisidAuthorization(cookieHeader.trim());
    if (auth) headers.Authorization = auth;
  }
  return headers;
}

export function buildStreamHeaders(cookieHeader?: string): Record<string, string> {
  return {
    'User-Agent': YTM_UA,
    Origin: YTM_ORIGIN,
    Referer: `${YTM_ORIGIN}/`,
    ...(cookieHeader?.trim() ? { Cookie: cookieHeader.trim() } : {}),
  };
}
