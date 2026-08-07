/**
 * Load cookiefile path + cookiesfrombrowser into YtdlpCookieJar.
 * Browser import: Tauri invoke `ytdlp_cookies_from_browser` when available;
 * otherwise accept preloaded Netscape text / cookie hub — never password login.
 */

import {
  parseNetscapeCookieText,
  type NetscapeCookie,
} from './cookies';
import type { YtdlpCookieJar } from './cookie-jar';
import type { YoutubeDLOptions } from './types';

export interface BrowserCookieSpec {
  browser: string;
  profile?: string | null;
  keyring?: string | null;
  container?: string | null;
}

export function parseCookiesFromBrowser(
  raw: YoutubeDLOptions['cookiesfrombrowser'],
): BrowserCookieSpec | null {
  if (raw == null || raw === false) return null;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return null;
    // "chrome:Profile 1" or just "chrome"
    const [browser, profile] = s.split(':');
    return { browser: (browser || 'chrome').toLowerCase(), profile: profile || null };
  }
  if (Array.isArray(raw) && raw.length) {
    return {
      browser: String(raw[0] || 'chrome').toLowerCase(),
      profile: raw[1] != null ? String(raw[1]) : null,
      keyring: raw[2] != null ? String(raw[2]) : null,
      container: raw[3] != null ? String(raw[3]) : null,
    };
  }
  return null;
}

function ingestNetscape(jar: YtdlpCookieJar, cookies: NetscapeCookie[]): number {
  let n = 0;
  for (const c of cookies) {
    jar.setCookie({
      domain: c.domain,
      name: c.name,
      value: c.value,
      path: c.path,
      secure: c.secure,
      expires: c.expires,
    });
    n++;
  }
  return n;
}

async function readTextMaybe(path: string): Promise<string | null> {
  try {
    const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');
    if (!(await exists(path))) return null;
    return await readTextFile(path);
  } catch {
    /* not in Tauri / path unreadable */
  }
  return null;
}

/**
 * Load params.cookiefile (disk path or inline Netscape) into jar.
 */
export async function loadCookiefileIntoJar(
  jar: YtdlpCookieJar,
  cookiefile: string | undefined,
): Promise<number> {
  if (!cookiefile?.trim()) return 0;
  const cf = cookiefile;
  if (cf.includes('\n') || cf.includes('\t')) {
    return ingestNetscape(jar, parseNetscapeCookieText(cf));
  }
  const text = await readTextMaybe(cf);
  if (text) return ingestNetscape(jar, parseNetscapeCookieText(text));
  return 0;
}

/**
 * Attempt browser cookie import. Returns count loaded + warning if deferred.
 */
export async function loadCookiesFromBrowserIntoJar(
  jar: YtdlpCookieJar,
  raw: YoutubeDLOptions['cookiesfrombrowser'],
  reportWarning?: (msg: string) => void,
): Promise<{ count: number; warning?: string }> {
  const spec = parseCookiesFromBrowser(raw);
  if (!spec) return { count: 0 };

  // Optional native command (desktop)
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const text = await invoke<string>('ytdlp_cookies_from_browser', {
      browser: spec.browser,
      profile: spec.profile,
      keyring: spec.keyring,
      container: spec.container,
    });
    if (typeof text === 'string' && text.trim()) {
      return { count: ingestNetscape(jar, parseNetscapeCookieText(text)) };
    }
  } catch {
    /* command missing or failed */
  }

  // If caller passed Netscape blob as cookiesfrombrowser string with tabs/newlines
  if (typeof raw === 'string' && (raw.includes('\t') || raw.includes('\n'))) {
    return { count: ingestNetscape(jar, parseNetscapeCookieText(raw)) };
  }

  const warning =
    `cookiesfrombrowser=${spec.browser}: native import unavailable; ` +
    'use cookiefile / Cookie Hub / paste Netscape cookies (password/SMS login is OUT)';
  reportWarning?.(warning);
  return { count: 0, warning };
}

/** Constructor-time cookie bootstrap. */
export async function bootstrapYtdlpCookies(
  jar: YtdlpCookieJar,
  params: YoutubeDLOptions,
  reportWarning?: (msg: string) => void,
): Promise<void> {
  await loadCookiefileIntoJar(jar, params.cookiefile as string | undefined);
  await loadCookiesFromBrowserIntoJar(jar, params.cookiesfrombrowser, reportWarning);
}
