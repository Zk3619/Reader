/**
 * 网易云扫码登录（对齐 NeriPlayer / NeteaseCloudMusicApi，TS 重写）
 * weapi 在部分环境下会 200 空 body → eapi / 无 CookieJar 重试兜底。
 */

import { request } from '@/lib/http';
import { getJarCookie } from '@/lib/http/cookie-jar';
import { eapiEncrypt } from '@/lib/media/audio/platform/api/eapi-crypto';
import { weapiEncrypt } from '@/lib/media/audio/platform/api/weapi-crypto';
import { isTauri } from '@/lib/platform/detect';

const NETEASE_ORIGIN = 'https://music.163.com';
const UNIKEY_WEAPI = '/weapi/login/qrcode/unikey';
const CHECK_WEAPI = '/weapi/login/qrcode/client/login';
const UNIKEY_EAPI_PATH = '/api/login/qrcode/unikey';
const CHECK_EAPI_PATH = '/api/login/qrcode/client/login';
const ACCOUNT_PATH = '/weapi/w/nuser/account/get';

const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0';

export type NeteaseQrStatusCode = 800 | 801 | 802 | 803 | number;

export type NeteaseQrLoginSession = {
  key: string;
  chainId: string;
  ydDeviceToken: string;
  /** 供手机网易云 App 扫描的 URL */
  qrContent: string;
};

export type NeteaseQrCheckResult = {
  code: NeteaseQrStatusCode;
  message: string;
  /** 803 成功时的 Cookie 串（含 MUSIC_U） */
  cookies?: string;
};

function createLoginChainId(): string {
  const randomPart = Math.floor(Math.random() * 1_000_000);
  return `v1_unknown-${randomPart}_web_login_${Date.now()}`;
}

export function buildNeteaseScanLoginUrl(key: string, chainId: string): string {
  const url = new URL(`${NETEASE_ORIGIN}/st/platform/scanlogin`);
  url.searchParams.set('codekey', key);
  url.searchParams.set('chainId', chainId);
  url.searchParams.set('hdw_device', 'web');
  url.searchParams.set('hdw_appid', 'web');
  url.searchParams.set('hitExp', '1');
  return url.toString();
}

/** 从可能被逗号拼接的 Set-Cookie 中提取 name=value */
export function parseNeteaseSetCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header.trim()) return out;
  const parts = header.split(/,(?=\s*[A-Za-z0-9_-]+=)/);
  for (const part of parts) {
    const first = part.split(';')[0]?.trim() ?? '';
    const eq = first.indexOf('=');
    if (eq <= 0) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (!name || /^(Path|Domain|Expires|Max-Age|SameSite|Secure|HttpOnly)$/i.test(name)) {
      continue;
    }
    out[name] = value;
  }
  return out;
}

function cookieMapToHeader(map: Record<string, string>): string {
  return Object.entries(map)
    .filter(([, v]) => v != null && String(v).length > 0)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function mergeCookieMaps(...maps: Array<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of maps) {
    for (const [k, v] of Object.entries(m)) {
      if (k && v) out[k] = v;
    }
  }
  return out;
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

function normalizeNeteaseCookies(raw: string): string {
  let c = raw.trim().replace(/\s*;\s*/g, '; ');
  if (!/os=/i.test(c)) c = c ? `${c}; os=pc` : 'os=pc';
  if (!/appver=/i.test(c)) c = `${c}; appver=8.10.35`;
  return c;
}

function hasMusicU(cookies: string): boolean {
  return /MUSIC_U\s*=\s*[^;\s]+/i.test(cookies);
}

function readMessage(json: Record<string, unknown>): string {
  const msg = json.message ?? json.msg;
  return typeof msg === 'string' ? msg : '';
}

function csrfFromCookies(cookies?: string): string {
  if (!cookies?.trim()) return '';
  return headerStringToMap(cookies).__csrf ?? '';
}

function withCsrfQuery(url: string, csrf: string): string {
  const u = new URL(url);
  if (!u.searchParams.has('csrf_token')) {
    u.searchParams.set('csrf_token', csrf);
  }
  return u.toString();
}

type QrHttpResult = {
  json: Record<string, unknown>;
  setCookie: string;
  refreshToken: string;
};

async function parseQrHttpResponse(
  res: Awaited<ReturnType<typeof request>>,
  label: string,
): Promise<QrHttpResult> {
  const setCookie = String(
    res.headers['set-cookie'] ?? res.headers['Set-Cookie'] ?? '',
  ).trim();
  const refreshToken = String(
    res.headers['x-refresh-token'] ?? res.headers['X-Refresh-Token'] ?? '',
  ).trim();

  const text = (await res.text()).trim();
  if (!text) {
    let bytes = 0;
    try {
      bytes = (await res.arrayBuffer()).byteLength;
    } catch {
      /* ignore */
    }
    console.warn('[netease-qr] empty body', {
      label,
      status: res.status,
      bytes,
      encoding: res.headers['content-encoding'] ?? res.headers['Content-Encoding'] ?? '',
    });
    throw new Error(`网易云扫码接口空响应: ${label} (HTTP ${res.status}, ${bytes} bytes)`);
  }
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`网易云扫码接口非 JSON: ${label}`);
  }
  return { json, setCookie, refreshToken };
}

async function weapiQrPost(
  path: string,
  data: Record<string, unknown>,
  options?: {
    cookies?: string;
    extraHeaders?: Record<string, string>;
    /** 创会话时勿带 CookieJar，避免脏 Cookie 导致 200 空 body */
    enableCookieJar?: boolean;
    useBackendHttp?: boolean;
  },
): Promise<QrHttpResult> {
  const { params, encSecKey } = weapiEncrypt(data);
  const body = new URLSearchParams({ params, encSecKey }).toString();
  const csrf = csrfFromCookies(options?.cookies);
  const url = withCsrfQuery(`${NETEASE_ORIGIN}${path}`, csrf);
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: '*/*',
    'User-Agent': DESKTOP_UA,
    Origin: NETEASE_ORIGIN,
    Referer: `${NETEASE_ORIGIN}/`,
    'x-os': 'web',
    'x-channelsource': 'undefined',
    'nm-gcore-status': '1',
    ...(options?.extraHeaders ?? {}),
  };
  if (options?.cookies?.trim()) {
    headers.Cookie = options.cookies.trim();
  }

  const res = await request(url, {
    method: 'POST',
    headers,
    body,
    useBackendHttp: options?.useBackendHttp ?? isTauri(),
    enableCookieJar: options?.enableCookieJar === true,
    ignorePageNavigationAbort: true,
    allowNon2xx: true,
  });
  return parseQrHttpResponse(res, path);
}

async function eapiQrPost(
  apiPath: string,
  data: Record<string, unknown>,
  options?: {
    cookies?: string;
    extraHeaders?: Record<string, string>;
    enableCookieJar?: boolean;
  },
): Promise<QrHttpResult> {
  const { params } = eapiEncrypt(apiPath, data);
  const body = new URLSearchParams({ params }).toString();
  const eapiUrl = `${NETEASE_ORIGIN}/eapi/${apiPath.replace(/^\/api\//, '')}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: '*/*',
    'User-Agent': DESKTOP_UA,
    Origin: NETEASE_ORIGIN,
    Referer: `${NETEASE_ORIGIN}/`,
    ...(options?.extraHeaders ?? {}),
  };
  if (options?.cookies?.trim()) {
    headers.Cookie = options.cookies.trim();
  }

  const res = await request(eapiUrl, {
    method: 'POST',
    headers,
    body,
    useBackendHttp: isTauri(),
    enableCookieJar: options?.enableCookieJar === true,
    ignorePageNavigationAbort: true,
    allowNon2xx: true,
  });
  return parseQrHttpResponse(res, eapiUrl);
}

/**
 * 创建扫码会话并返回二维码内容 URL。
 * 优先 weapi（NCM/NeriPlayer）；空 body 时改 eapi / 关 CookieJar 重试。
 */
export async function createNeteaseQrLoginSession(): Promise<NeteaseQrLoginSession> {
  const attempts: Array<() => Promise<QrHttpResult>> = [
    // 对齐 NeteaseCloudMusicApi：仅 type=1，不带 CookieJar
    () =>
      weapiQrPost(UNIKEY_WEAPI, { type: 1 }, { enableCookieJar: false }),
    // NeriPlayer：带 noCheckToken
    () =>
      weapiQrPost(
        UNIKEY_WEAPI,
        { type: 1, noCheckToken: true },
        { enableCookieJar: false },
      ),
    // 部分环境 download_binary 空 body：改走 Tauri HTTP 插件
    () =>
      weapiQrPost(
        UNIKEY_WEAPI,
        { type: 1 },
        { enableCookieJar: false, useBackendHttp: false },
      ),
    // eapi 兜底（type=3 为客户端约定）
    () => eapiQrPost(UNIKEY_EAPI_PATH, { type: 3 }, { enableCookieJar: false }),
    () => eapiQrPost(UNIKEY_EAPI_PATH, { type: 1 }, { enableCookieJar: false }),
  ];

  let lastError: Error | null = null;
  for (const run of attempts) {
    try {
      const { json } = await run();
      const code = Number(json.code ?? -1);
      const key = String(json.unikey ?? '').trim();
      if (code === 200 && key) {
        const chainId = createLoginChainId();
        return {
          key,
          chainId,
          ydDeviceToken: '',
          qrContent: buildNeteaseScanLoginUrl(key, chainId),
        };
      }
      lastError = new Error(readMessage(json) || `创建扫码会话失败 (code=${code})`);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError ?? new Error('创建扫码会话失败');
}

async function collectCookiesAfterConfirm(
  setCookieHeader: string,
  refreshToken: string,
  requestCookies?: string,
): Promise<string> {
  const fromHeader = parseNeteaseSetCookieHeader(setCookieHeader);
  const fromJar = headerStringToMap(await getJarCookie(NETEASE_ORIGIN));
  const fromRequest = headerStringToMap(requestCookies ?? '');
  let merged = mergeCookieMaps(fromRequest, fromJar, fromHeader);

  if (!merged.MUSIC_U && refreshToken) {
    merged = { ...merged, MUSIC_U: refreshToken };
  }

  let cookieHeader = normalizeNeteaseCookies(cookieMapToHeader(merged));
  if (hasMusicU(cookieHeader)) {
    const verified = await verifyNeteaseAccountCookies(cookieHeader);
    if (verified) return verified;
    return cookieHeader;
  }
  return '';
}

async function verifyNeteaseAccountCookies(cookies: string): Promise<string | null> {
  const csrf = headerStringToMap(cookies).__csrf ?? '';
  const data: Record<string, unknown> = csrf ? { csrf_token: csrf } : {};
  try {
    const path = csrf
      ? `${ACCOUNT_PATH}?csrf_token=${encodeURIComponent(csrf)}`
      : ACCOUNT_PATH;
    const { json } = await weapiQrPost(path, data, {
      cookies,
      enableCookieJar: true,
    });
    const ok =
      Number(json.code ?? -1) === 200 &&
      (json.account != null || json.profile != null);
    return ok ? normalizeNeteaseCookies(cookies) : null;
  } catch {
    return hasMusicU(cookies) ? normalizeNeteaseCookies(cookies) : null;
  }
}

/** 轮询扫码状态：800 过期 / 801 等待 / 802 已扫待确认 / 803 成功 */
export async function checkNeteaseQrLogin(
  session: NeteaseQrLoginSession,
): Promise<NeteaseQrCheckResult> {
  const attempts: Array<() => Promise<QrHttpResult>> = [
    () =>
      weapiQrPost(
        CHECK_WEAPI,
        {
          type: 1,
          noCheckToken: true,
          key: session.key,
          ydDeviceToken: session.ydDeviceToken || '',
        },
        {
          enableCookieJar: true,
          extraHeaders: {
            'x-loginmethod': 'QrCode',
            'x-login-chain-id': session.chainId,
          },
        },
      ),
    () =>
      weapiQrPost(
        CHECK_WEAPI,
        { type: 1, key: session.key },
        { enableCookieJar: true },
      ),
    () =>
      eapiQrPost(
        CHECK_EAPI_PATH,
        { type: 3, key: session.key },
        { enableCookieJar: true },
      ),
  ];

  let lastError: Error | null = null;
  for (const run of attempts) {
    try {
      const { json, setCookie, refreshToken } = await run();
      const code = Number(json.code ?? -1);
      const message = readMessage(json);

      if (code === 803) {
        const bodyCookie =
          typeof json.cookie === 'string'
            ? json.cookie
            : Array.isArray(json.cookie)
              ? (json.cookie as string[]).join('; ')
              : '';
        const cookies =
          (await collectCookiesAfterConfirm(setCookie, refreshToken, bodyCookie)) ||
          (bodyCookie && hasMusicU(bodyCookie)
            ? normalizeNeteaseCookies(bodyCookie)
            : '');

        if (!cookies || !hasMusicU(cookies)) {
          return {
            code,
            message: message || '扫码成功但未拿到 MUSIC_U，请重试或改用粘贴 Cookie',
          };
        }
        return { code, message: message || '登录成功', cookies };
      }

      // 801/802/800 等中间态直接返回，无需继续兜底
      if (code === 800 || code === 801 || code === 802 || code > 0) {
        return { code, message };
      }
      lastError = new Error(message || `扫码状态异常 (code=${code})`);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError ?? new Error('扫码状态查询失败');
}

export function describeNeteaseQrStatus(code: NeteaseQrStatusCode): string {
  switch (code) {
    case 800:
      return '二维码已过期，请刷新';
    case 801:
      return '请使用网易云 App 扫码';
    case 802:
      return '已扫码，请在手机上确认';
    case 803:
      return '登录成功';
    default:
      return `状态 ${code}`;
  }
}
