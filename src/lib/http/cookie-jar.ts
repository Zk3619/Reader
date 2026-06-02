/**
 * 对齐 legado-own CookieManager + CookieStore：
 * - 按二级域名（eTLD+1 近似）存持久 Cookie（SQLite）
 * - 会话 Cookie（内存，应用重启失效）
 * - 403 等响应仍写入 Set-Cookie
 * - 请求时：CookieStore 与 Header Cookie 合并（header 同名覆盖 jar）
 */

import { getDatabase } from '@/lib/database/database-core';
import { mergeLegadoCookieHeaderStrings } from '@/lib/js-engine/legado/normalize-legado-ajax-body';

const sessionByDomain = new Map<string, string>();

/** 对齐 NetworkUtils.getSubDomain（简化：IP 原样；a.b.com → b.com） */
export function getSubDomain(url: string): string {
  const trimmed = url.trim();
  try {
    const host = new URL(trimmed).hostname;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host;
    const parts = host.split('.').filter(Boolean);
    if (parts.length <= 2) return host;
    return parts.slice(-2).join('.');
  } catch {
    const m = trimmed.match(/https?:\/\/([^/?#]+)/i);
    const host = m?.[1]?.split(':')[0] ?? trimmed;
    return host;
  }
}

export function cookieHeaderToMap(cookie: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of String(cookie ?? '').split(';')) {
    const t = part.trim();
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    const value = t.slice(eq + 1).trim();
    if (!key) continue;
    if (value || value === 'null') map.set(key, value);
  }
  return map;
}

export function mapToCookieHeader(map: Map<string, string>): string {
  const parts: string[] = [];
  for (const [k, v] of map) {
    parts.push(`${k}=${v}`);
  }
  return parts.join('; ');
}

function mergeCookieMaps(...cookies: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of cookies) {
    if (!c?.trim()) continue;
    for (const [k, v] of cookieHeaderToMap(c)) {
      out.set(k, v);
    }
  }
  return out;
}

export function getSessionCookie(domain: string): string {
  return sessionByDomain.get(domain) ?? '';
}

function setSessionCookie(domain: string, cookie: string): void {
  const trimmed = cookie.trim();
  if (!trimmed) {
    sessionByDomain.delete(domain);
    return;
  }
  sessionByDomain.set(domain, trimmed);
}

async function readPersistentCookieForKey(key: string): Promise<string> {
  const db = await getDatabase();
  const rows = await db.select<{ cookie: string }>(
    'SELECT cookie FROM cookies WHERE url = ?',
    [key],
  );
  return rows[0]?.cookie?.trim() ?? '';
}

export async function getPersistentCookie(url: string): Promise<string> {
  try {
    const domain = getSubDomain(url);
    let cookie = await readPersistentCookieForKey(domain);
    if (!cookie) {
      try {
        const host = new URL(url.trim()).hostname;
        if (host && host !== domain) {
          cookie = await readPersistentCookieForKey(host);
        }
      } catch {
        /* ignore */
      }
    }
    return cookie;
  } catch (e) {
    console.warn('[cookie-jar] getPersistentCookie failed', e);
    return '';
  }
}

/** 持久 + 会话（供请求发出前读取） */
export async function getJarCookie(url: string): Promise<string> {
  const domain = getSubDomain(url);
  const persistent = await getPersistentCookie(url);
  const session = getSessionCookie(domain);
  let merged = '';
  if (persistent) merged = persistent;
  if (session) merged = merged ? mergeLegadoCookieHeaderStrings(merged, session) : session;
  return merged;
}

/**
 * 对齐 AnalyzeUrl.setCookie：jar 先合并，书源 header Cookie 同名覆盖
 */
export function mergeJarWithRequestCookie(jar: string, requestCookie: string): string {
  const j = jar.trim();
  const r = requestCookie.trim();
  if (!j) return r;
  if (!r) return j;
  return mergeLegadoCookieHeaderStrings(j, r);
}

/**
 * 对齐 CookieManager.loadRequest（网络层）：request 先合并，jar 覆盖同名键
 */
export function mergeRequestCookieWithJar(requestCookie: string, jar: string): string {
  const r = requestCookie.trim();
  const j = jar.trim();
  if (!r) return j;
  if (!j) return r;
  return mergeLegadoCookieHeaderStrings(r, j);
}

export async function setPersistentCookie(url: string, cookie: string): Promise<void> {
  const domain = getSubDomain(url);
  const trimmed = cookie.trim();
  try {
    const db = await getDatabase();
    await db.execute('INSERT OR REPLACE INTO cookies (url, cookie) VALUES (?, ?)', [
      domain,
      trimmed,
    ]);
  } catch (e) {
    console.warn('[cookie-jar] setPersistentCookie failed', e);
  }
}

/** 对齐 CookieStore.replaceCookie */
export async function replacePersistentCookie(url: string, cookie: string): Promise<void> {
  const incoming = cookie.trim();
  if (!incoming) return;
  const old = await getPersistentCookie(url);
  if (!old) {
    await setPersistentCookie(url, incoming);
    return;
  }
  const map = mergeCookieMaps(old, incoming);
  await setPersistentCookie(url, mapToCookieHeader(map));
}

export async function removeJarCookies(url: string): Promise<void> {
  const domain = getSubDomain(url);
  sessionByDomain.delete(domain);
  try {
    const db = await getDatabase();
    await db.execute('DELETE FROM cookies WHERE url = ?', [domain]);
  } catch (e) {
    console.warn('[cookie-jar] removeJarCookies failed', e);
  }
}

function isPersistentSetCookie(setCookieLine: string): boolean {
  const lower = setCookieLine.toLowerCase();
  if (/\bmax-age=0\b/.test(lower)) return false;
  if (/\bexpires=/i.test(lower)) return true;
  const maxAge = lower.match(/\bmax-age=(\d+)/);
  if (maxAge) return Number(maxAge[1]) > 0;
  return false;
}

function parseSetCookieLine(line: string): { name: string; value: string } | null {
  const first = line.split(';')[0]?.trim() ?? '';
  const eq = first.indexOf('=');
  if (eq <= 0) return null;
  return { name: first.slice(0, eq).trim(), value: first.slice(eq + 1).trim() };
}

/** 从 Set-Cookie 行列表写入 jar（含 403 挑战页） */
export async function saveSetCookieLines(url: string, lines: string[]): Promise<void> {
  if (!lines.length) return;
  const domain = getSubDomain(url);
  const persistentMap = cookieHeaderToMap(await getPersistentCookie(url));
  const sessionMap = cookieHeaderToMap(getSessionCookie(domain));

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = parseSetCookieLine(trimmed);
    if (!parsed?.name) continue;
    const target = isPersistentSetCookie(trimmed) ? persistentMap : sessionMap;
    target.set(parsed.name, parsed.value);
  }

  await setPersistentCookie(url, mapToCookieHeader(persistentMap));
  setSessionCookie(domain, mapToCookieHeader(sessionMap));
}

export function collectSetCookieLines(
  headers: Headers | Record<string, string>,
): string[] {
  if (headers instanceof Headers) {
    if (typeof headers.getSetCookie === 'function') {
      const lines = headers.getSetCookie();
      if (lines?.length) return lines;
    }
    const single = headers.get('set-cookie');
    return single ? [single] : [];
  }
  const out: string[] = [];
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== 'set-cookie') continue;
    if (Array.isArray(value)) out.push(...value.map(String));
    else if (value) out.push(String(value));
  }
  return out;
}

/** 对齐 CookieManager.saveResponse */
export async function saveResponseCookies(
  url: string,
  headers: Headers | Record<string, string>,
): Promise<void> {
  const lines = collectSetCookieLines(headers);
  if (lines.length) await saveSetCookieLines(url, lines);
}

/** 测试 / 重置 */
export function clearSessionCookies(): void {
  sessionByDomain.clear();
}
