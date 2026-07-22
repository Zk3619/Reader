/**
 * MusicFree Cookie polyfill（对齐 Desktop @react-native-cookies/cookies API）
 * Desktop 走 Electron session；Reader 用按 URL/域名划分的持久化 jar。
 */

export type MfCookie = {
  name: string;
  value: string;
  path?: string;
  domain?: string;
  version?: string;
  expires?: string;
  secure?: boolean;
  httpOnly?: boolean;
};

export type MfCookiesMap = Record<string, MfCookie>;

const STORAGE_KEY = 'reader_mf_cookie_jar_v1';

type JarEntry = MfCookie & { url: string };

let jar: JarEntry[] = [];
let loaded = false;

function loadJar(): void {
  if (loaded) return;
  loaded = true;
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as JarEntry[];
    if (Array.isArray(parsed)) jar = parsed.filter((c) => c?.name && c.url);
  } catch {
    jar = [];
  }
}

function saveJar(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jar));
  } catch {
    // quota — keep memory only
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return '/';
  }
}

function domainMatches(cookieDomain: string | undefined, host: string): boolean {
  if (!cookieDomain) return true;
  const d = cookieDomain.replace(/^\./, '').toLowerCase();
  return host === d || host.endsWith(`.${d}`);
}

function pathMatches(cookiePath: string | undefined, path: string): boolean {
  const p = cookiePath || '/';
  return path === p || path.startsWith(p.endsWith('/') ? p : `${p}/`) || path.startsWith(p);
}

function isExpired(cookie: MfCookie): boolean {
  if (!cookie.expires) return false;
  const t = Date.parse(cookie.expires);
  return Number.isFinite(t) && t <= Date.now();
}

async function set(url: string, cookie: MfCookie): Promise<boolean> {
  loadJar();
  if (!cookie?.name) return false;
  try {
    const host = hostOf(url);
    if (!host) return false;
    jar = jar.filter(
      (c) =>
        !(
          c.name === cookie.name &&
          hostOf(c.url) === host &&
          (c.path || '/') === (cookie.path || '/')
        ),
    );
    if (!isExpired(cookie)) {
      jar.push({
        ...cookie,
        url,
        domain: cookie.domain ?? host,
        path: cookie.path ?? '/',
      });
    }
    saveJar();
    return true;
  } catch {
    return false;
  }
}

async function get(url: string): Promise<MfCookiesMap> {
  loadJar();
  try {
    const host = hostOf(url);
    const path = pathOf(url);
    const out: MfCookiesMap = {};
    const next: JarEntry[] = [];
    for (const c of jar) {
      if (isExpired(c)) continue;
      next.push(c);
      if (!domainMatches(c.domain, host)) continue;
      if (!pathMatches(c.path, path)) continue;
      out[c.name] = {
        name: c.name,
        value: c.value,
        path: c.path,
        domain: c.domain,
        expires: c.expires,
        secure: c.secure,
        httpOnly: c.httpOnly,
        version: c.version,
      };
    }
    if (next.length !== jar.length) {
      jar = next;
      saveJar();
    }
    return out;
  } catch {
    return {};
  }
}

async function flush(): Promise<void> {
  loadJar();
  saveJar();
}

async function clearAll(): Promise<void> {
  jar = [];
  loaded = true;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** 供调试/测试重置 */
export function resetMfCookieJarForTests(): void {
  jar = [];
  loaded = false;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

const mfCookies = {
  set,
  get,
  flush,
  clearAll,
};

export default mfCookies;
