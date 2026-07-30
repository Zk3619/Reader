/**
 * Cookie helpers: Netscape cookie file text → Cookie header,
 * and light wrappers around platform credential jars.
 */

export interface NetscapeCookie {
  domain: string;
  includeSubdomains: boolean;
  path: string;
  secure: boolean;
  expires: number;
  name: string;
  value: string;
}

/** Parse Netscape / curl cookie file text into structured cookies. */
export function parseNetscapeCookieText(text: string): NetscapeCookie[] {
  const out: NetscapeCookie[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      // #HttpOnly_ prefix
      if (line.startsWith('#HttpOnly_')) {
        const rest = line.slice('#HttpOnly_'.length);
        const parsed = parseCookieLine(rest);
        if (parsed) out.push(parsed);
      }
      continue;
    }
    const parsed = parseCookieLine(line);
    if (parsed) out.push(parsed);
  }
  return out;
}

function parseCookieLine(line: string): NetscapeCookie | null {
  const parts = line.split('\t');
  if (parts.length < 7) return null;
  const [domain, flag, path, secure, expires, name, ...valueParts] = parts;
  if (!domain || !name) return null;
  return {
    domain: domain.trim(),
    includeSubdomains: String(flag).toUpperCase() === 'TRUE',
    path: path || '/',
    secure: String(secure).toUpperCase() === 'TRUE',
    expires: Number(expires) || 0,
    name: name.trim(),
    value: valueParts.join('\t'),
  };
}

function domainMatches(cookieDomain: string, host: string): boolean {
  const d = cookieDomain.startsWith('.') ? cookieDomain.slice(1) : cookieDomain;
  const h = host.toLowerCase();
  const cd = d.toLowerCase();
  return h === cd || h.endsWith('.' + cd);
}

function pathMatches(cookiePath: string, urlPath: string): boolean {
  const p = cookiePath || '/';
  if (urlPath.startsWith(p)) return true;
  return false;
}

/** Filter cookies applicable to a URL (domain/path/expiry/secure). */
export function cookiesForUrl(cookies: NetscapeCookie[], url: string): NetscapeCookie[] {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return [];
  }
  const now = Math.floor(Date.now() / 1000);
  return cookies.filter((c) => {
    if (c.expires > 0 && c.expires < now) return false;
    if (c.secure && u.protocol !== 'https:') return false;
    if (!domainMatches(c.domain, u.hostname)) return false;
    if (!pathMatches(c.path, u.pathname || '/')) return false;
    return true;
  });
}

/** Build `Cookie` request header value from Netscape cookies for a URL. */
export function buildCookieHeader(cookies: NetscapeCookie[], url: string): string {
  const applicable = cookiesForUrl(cookies, url);
  // Later cookies with same name override earlier (Netscape order)
  const map = new Map<string, string>();
  for (const c of applicable) {
    map.set(c.name, c.value);
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

export function cookieHeaderFromNetscapeText(text: string, url: string): string {
  return buildCookieHeader(parseNetscapeCookieText(text), url);
}

/**
 * Merge multiple Cookie header fragments (jar + explicit + file).
 * Later values override same-name keys.
 */
export function mergeCookieHeaders(...parts: Array<string | null | undefined>): string {
  const map = new Map<string, string>();
  for (const part of parts) {
    if (!part?.trim()) continue;
    for (const segment of part.split(';')) {
      const s = segment.trim();
      if (!s) continue;
      const eq = s.indexOf('=');
      if (eq <= 0) continue;
      map.set(s.slice(0, eq).trim(), s.slice(eq + 1).trim());
    }
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

/**
 * Try to load cookies from Reader's cookie jar / platform credentials for a URL.
 * Falls back gracefully when jar APIs are unavailable.
 */
export async function cookieHeaderFromPlatform(url: string): Promise<string> {
  try {
    const mod = await import('@/lib/http/cookie-jar');
    if (typeof mod.getJarCookie === 'function') {
      return (await mod.getJarCookie(url)) || '';
    }
  } catch {
    /* jar not available in this environment */
  }
  return '';
}

/**
 * Resolve Cookie header from YoutubeDL-style options.
 */
export async function resolveCookieHeader(
  url: string,
  options?: {
    cookie?: string;
    cookiefileText?: string;
    cookiefile?: string;
    usePlatformJar?: boolean;
  },
): Promise<string> {
  const parts: string[] = [];
  if (options?.usePlatformJar !== false) {
    parts.push(await cookieHeaderFromPlatform(url));
  }
  if (options?.cookiefileText) {
    parts.push(cookieHeaderFromNetscapeText(options.cookiefileText, url));
  }
  if (options?.cookie) {
    // raw header or Netscape text
    if (options.cookie.includes('\t') || options.cookie.includes('\n')) {
      parts.push(cookieHeaderFromNetscapeText(options.cookie, url));
    } else {
      parts.push(options.cookie);
    }
  }
  return mergeCookieHeaders(...parts);
}
