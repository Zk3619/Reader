/**
 * 哔哩哔哩扫码登录（对齐 NeriPlayer BiliQrLoginClient，TS 重写）
 * generate → poll；成功时合并 Set-Cookie（须含 SESSDATA）。
 */

import { request } from '@/lib/http';
import { getJarCookie } from '@/lib/http/cookie-jar';
import { isTauri } from '@/lib/platform/detect';

const BILI_QR_GENERATE =
  'https://passport.bilibili.com/x/passport-login/web/qrcode/generate';
const BILI_QR_POLL =
  'https://passport.bilibili.com/x/passport-login/web/qrcode/poll';
const BILI_REFERER = 'https://passport.bilibili.com/login';
const BILI_ORIGIN = 'https://passport.bilibili.com';

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** 86101 等待 / 86090 已扫 / 0 成功 / 86038 过期 */
export type BiliQrStatusCode = 0 | 86101 | 86090 | 86038 | number;

export type BiliQrLoginSession = {
  key: string;
  /** 供 bilibili App 扫描的 URL */
  qrContent: string;
  /** 会话内累积 Cookie（generate/poll 的 Set-Cookie） */
  cookieJar: Record<string, string>;
};

export type BiliQrCheckResult = {
  code: BiliQrStatusCode;
  message: string;
  /** code===0 且 Cookie 完整时返回 */
  cookies?: string;
};

/** 从可能被逗号拼接的 Set-Cookie 中提取 name=value */
export function parseBiliSetCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header.trim()) return out;
  const parts = header.split(/,(?=\s*[A-Za-z0-9_-]+=)/);
  for (const part of parts) {
    const attrs = part.split(';').map((s) => s.trim());
    const first = attrs[0] ?? '';
    const eq = first.indexOf('=');
    if (eq <= 0) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (!name || /^(Path|Domain|Expires|Max-Age|SameSite|Secure|HttpOnly)$/i.test(name)) {
      continue;
    }
    const removed =
      !value ||
      attrs.some(
        (a) =>
          /^Max-Age=0$/i.test(a) ||
          /^Expires=Thu,\s*01\s+Jan\s+1970/i.test(a),
      );
    if (removed) {
      delete out[name];
    } else {
      out[name] = value;
    }
  }
  return out;
}

function cookieMapToHeader(map: Record<string, string>): string {
  return Object.entries(map)
    .filter(([, v]) => v != null && String(v).length > 0)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function mergeCookieMaps(
  target: Record<string, string>,
  ...maps: Array<Record<string, string>>
): void {
  for (const m of maps) {
    for (const [k, v] of Object.entries(m)) {
      if (!k) continue;
      if (!v) {
        delete target[k];
      } else {
        target[k] = v;
      }
    }
  }
}

function headerStringToMap(cookie: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of cookie.split(';')) {
    const t = part.trim();
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

function hasSessData(cookies: string | Record<string, string>): boolean {
  if (typeof cookies === 'string') {
    return /SESSDATA\s*=\s*[^;\s]+/i.test(cookies);
  }
  return Boolean(cookies.SESSDATA?.trim());
}

function readMessage(json: Record<string, unknown>): string {
  const msg = json.message ?? json.msg;
  return typeof msg === 'string' ? msg : '';
}

async function biliQrGet(
  url: string,
  cookieJar: Record<string, string>,
): Promise<{ json: Record<string, unknown>; setCookie: string }> {
  const cookieHeader = cookieMapToHeader(cookieJar);
  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    Referer: BILI_REFERER,
    'User-Agent': DESKTOP_UA,
  };
  if (cookieHeader) headers.Cookie = cookieHeader;

  const attempts: Array<{ useBackendHttp: boolean; enableCookieJar: boolean }> = [
    { useBackendHttp: isTauri(), enableCookieJar: true },
    { useBackendHttp: isTauri(), enableCookieJar: false },
    { useBackendHttp: false, enableCookieJar: false },
  ];

  let lastError: Error | null = null;
  for (const opts of attempts) {
    try {
      const res = await request(url, {
        method: 'GET',
        headers,
        timeout: 15_000,
        useBackendHttp: opts.useBackendHttp,
        enableCookieJar: opts.enableCookieJar,
        ignorePageNavigationAbort: true,
        allowNon2xx: true,
      });
      const setCookie = String(
        res.headers['set-cookie'] ?? res.headers['Set-Cookie'] ?? '',
      ).trim();
      const text = (await res.text()).trim();
      if (!text) {
        throw new Error(`B 站扫码接口空响应 (HTTP ${res.status})`);
      }
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new Error('B 站扫码接口非 JSON');
      }
      mergeCookieMaps(cookieJar, parseBiliSetCookieHeader(setCookie));
      if (opts.enableCookieJar) {
        try {
          const jar = await getJarCookie(BILI_ORIGIN);
          if (jar.trim()) mergeCookieMaps(cookieJar, headerStringToMap(jar));
          const jarWww = await getJarCookie('https://www.bilibili.com/');
          if (jarWww.trim()) mergeCookieMaps(cookieJar, headerStringToMap(jarWww));
        } catch {
          /* ignore */
        }
      }
      return { json, setCookie };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError ?? new Error('B 站扫码请求失败');
}

export async function createBiliQrLoginSession(): Promise<BiliQrLoginSession> {
  const cookieJar: Record<string, string> = {};
  const { json } = await biliQrGet(BILI_QR_GENERATE, cookieJar);
  const code = Number(json.code ?? -1);
  const data = (json.data ?? {}) as Record<string, unknown>;
  const key = String(data.qrcode_key ?? '').trim();
  const qrContent = String(data.url ?? '').trim();
  if (code !== 0 || !key || !qrContent) {
    throw new Error(readMessage(json) || `创建扫码会话失败 (code=${code})`);
  }
  return { key, qrContent, cookieJar };
}

export async function checkBiliQrLogin(
  session: BiliQrLoginSession,
): Promise<BiliQrCheckResult> {
  const url = `${BILI_QR_POLL}?qrcode_key=${encodeURIComponent(session.key)}`;
  const { json } = await biliQrGet(url, session.cookieJar);
  const rootCode = Number(json.code ?? -1);
  if (rootCode !== 0) {
    throw new Error(readMessage(json) || `扫码轮询失败 (code=${rootCode})`);
  }
  const data = (json.data ?? {}) as Record<string, unknown>;
  const code = Number(data.code ?? rootCode) as BiliQrStatusCode;
  const message =
    (typeof data.message === 'string' && data.message) ||
    readMessage(json) ||
    describeBiliQrStatus(code);

  if (code !== 0) {
    return { code, message };
  }

  // poll 成功时可能仍缺 SESSDATA：再并一次 jar
  try {
    const jar = await getJarCookie(BILI_ORIGIN);
    if (jar.trim()) mergeCookieMaps(session.cookieJar, headerStringToMap(jar));
    const jarWww = await getJarCookie('https://www.bilibili.com/');
    if (jarWww.trim()) mergeCookieMaps(session.cookieJar, headerStringToMap(jarWww));
  } catch {
    /* ignore */
  }

  if (!hasSessData(session.cookieJar)) {
    return {
      code: -1,
      message: '登录成功但 Cookie 不完整（缺少 SESSDATA），请重试或改用 WebView',
    };
  }

  return {
    code: 0,
    message: describeBiliQrStatus(0),
    cookies: cookieMapToHeader(session.cookieJar),
  };
}

export function describeBiliQrStatus(code: BiliQrStatusCode): string {
  switch (code) {
    case 86101:
      return '请使用哔哩哔哩 App 扫码';
    case 86090:
      return '已扫码，请在手机上确认登录';
    case 0:
      return '登录成功';
    case 86038:
      return '二维码已过期，请刷新';
    default:
      return '';
  }
}
