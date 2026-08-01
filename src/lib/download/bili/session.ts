/**
 * B 站会话：Cookie Hub + 扫码 + 粘贴 + 刷新 + 设备 Cookie
 */

import { request } from '@/lib/http';
import { isTauri } from '@/lib/platform/detect';
import {
  clearPlatformCookies,
  publishPlatformCookies,
  resolveSharedCookies,
  warmCookieHub,
} from '@/lib/cookie-hub';
import {
  clearAuthSession,
  persistAuthCookies,
} from '@/lib/media/audio/platform/auth/session';
import {
  checkBiliQrLogin,
  createBiliQrLoginSession,
  describeBiliQrStatus,
  type BiliQrLoginSession,
} from '@/lib/media/audio/platform/auth/bili-qr-login';
import { clearWbiCache } from './wbi';
import { correspondPath, getFingerPrint } from './fingerprint';
import { BiliError } from './error';
import type { BiliUserProfile } from './types';

export const BILI_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

let headerCookie = '';
let headerSource = 'none';

export function getBiliCookieString(): string {
  return headerCookie;
}

export function getBiliRequestHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': BILI_UA,
    Referer: 'https://www.bilibili.com/',
    Origin: 'https://www.bilibili.com',
  };
  if (headerCookie.trim()) h.Cookie = headerCookie.trim();
  return h;
}

export function isBiliLoggedIn(): boolean {
  return /SESSDATA=/.test(headerCookie);
}

function pickCookie(name: string, cookie = headerCookie): string {
  return cookie.match(new RegExp(`${name}=([^;]+)(?=;|$)`))?.[1] ?? '';
}

export async function syncBiliSessionFromHub(): Promise<ResolvedSession> {
  await warmCookieHub(['bili']);
  const resolved = await resolveSharedCookies('bili');
  headerCookie = resolved.cookies.trim();
  headerSource = resolved.source;
  return {
    cookies: headerCookie,
    source: headerSource,
    isLogin: isBiliLoggedIn(),
  };
}

export type ResolvedSession = {
  cookies: string;
  source: string;
  isLogin: boolean;
};

/** buvid3/4 + bili_ticket + _uuid */
export async function ensureDeviceCookies(): Promise<void> {
  await syncBiliSessionFromHub();
  let cookie = headerCookie;

  const hasBuvid = /buvid3=/.test(cookie);
  if (!hasBuvid) {
    try {
      const home = await request('https://www.bilibili.com/', {
        method: 'GET',
        headers: { 'User-Agent': BILI_UA },
        useBackendHttp: isTauri(),
        timeout: 15000,
        retry: 1,
      });
      // jar 可能已写入；再拉 spi
      const spi = await request(
        'https://api.bilibili.com/x/frontend/finger/spi',
        {
          method: 'GET',
          headers: { 'User-Agent': BILI_UA, Referer: 'https://www.bilibili.com/' },
          useBackendHttp: isTauri(),
          timeout: 15000,
          retry: 1,
        },
      );
      const body = (await spi.json()) as {
        code?: number;
        data?: { b_3?: string; b_4?: string };
      };
      if (body.data?.b_3) {
        cookie = mergeCookie(cookie, `buvid3=${body.data.b_3}`);
      }
      if (body.data?.b_4) {
        cookie = mergeCookie(cookie, `buvid4=${body.data.b_4}`);
      }
      void home;
    } catch (e) {
      console.warn('[bili] buvid init failed', e);
    }
  }

  if (!/_uuid=/.test(cookie)) {
    const uuid = genUuid();
    cookie = mergeCookie(cookie, `_uuid=${uuid}`);
  }

  if (!/bili_ticket=/.test(cookie)) {
    try {
      const ticket = await fetchBiliTicket(cookie);
      if (ticket) cookie = mergeCookie(cookie, `bili_ticket=${ticket}`);
    } catch (e) {
      console.warn('[bili] ticket init failed', e);
    }
  }

  headerCookie = cookie;
  if (cookie.trim()) {
    await publishPlatformCookies('bili', cookie, {
      alsoPersistAuth: isBiliLoggedIn(),
      healthy: isBiliLoggedIn(),
    });
  }
}

function mergeCookie(existing: string, pair: string): string {
  const [name] = pair.split('=');
  if (!name) return existing;
  const parts = existing
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((p) => !p.startsWith(`${name}=`));
  parts.push(pair);
  return parts.join('; ');
}

function genUuid(): string {
  const hex = () =>
    Math.floor(Math.random() * 0x10000)
      .toString(16)
      .padStart(4, '0')
      .toUpperCase();
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}infoc`;
}

async function fetchBiliTicket(cookie: string): Promise<string | null> {
  const ts = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('XgwSnXG1w/IheEQfp8uC7Ybeww2K=gR'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`ts${ts}`),
  );
  const hexsign = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const url = `https://api.bilibili.com/bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket?key_id=ec02&hexsign=${hexsign}&context[ts]=${ts}&csrf=`;
  const res = await request(url, {
    method: 'POST',
    headers: {
      'User-Agent': BILI_UA,
      Referer: 'https://www.bilibili.com/',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    useBackendHttp: isTauri(),
    timeout: 15000,
    retry: 1,
  });
  const body = (await res.json()) as {
    code?: number;
    data?: { ticket?: string };
  };
  return body.data?.ticket ?? null;
}

export async function activateCookies(): Promise<void> {
  const uuid = pickCookie('_uuid');
  if (!uuid) return;
  const payload = getFingerPrint(uuid);
  try {
    await request(
      'https://api.bilibili.com/x/internal/gaia-gateway/ExClimbWuzhi',
      {
        method: 'POST',
        headers: {
          ...getBiliRequestHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ payload: JSON.stringify(payload) }),
        useBackendHttp: isTauri(),
        timeout: 15000,
        retry: 0,
        allowNon2xx: true,
      },
    );
  } catch (e) {
    console.warn('[bili] activateCookies failed', e);
  }
}

export async function applyPastedCookies(raw: string): Promise<void> {
  const cookies = raw.trim();
  if (!cookies) throw new BiliError('Cookie 为空');
  if (!/SESSDATA=/.test(cookies)) {
    throw new BiliError('Cookie 中缺少 SESSDATA');
  }
  headerCookie = cookies;
  headerSource = 'paste';
  clearWbiCache();
  await persistAuthCookies('bili', cookies, true);
  await publishPlatformCookies('bili', cookies, {
    alsoPersistAuth: false,
    healthy: true,
  });
  await activateCookies();
}

export async function logoutBili(): Promise<void> {
  headerCookie = '';
  headerSource = 'none';
  clearWbiCache();
  await clearAuthSession('bili');
  await clearPlatformCookies('bili');
}

export async function fetchBiliUserProfile(): Promise<BiliUserProfile> {
  await syncBiliSessionFromHub();
  const mid = pickCookie('DedeUserID');
  if (!mid || !isBiliLoggedIn()) {
    return {
      mid: 0,
      name: '未登录',
      avatar: '',
      isLogin: false,
      cookieSource: headerSource,
    };
  }
  try {
    await checkRefresh();
  } catch (e) {
    console.warn('[bili] refresh check failed', e);
  }
  const { tryFetch } = await import('./http');
  const info = (await tryFetch(
    'https://api.bilibili.com/x/space/wbi/acc/info',
    { auth: 'wbi', params: { mid }, ignoreErr: true },
  )) as { code?: number; data?: { name?: string; face?: string; sign?: string; level?: number; mid?: number } };
  if (info.code !== 0 || !info.data) {
    return {
      mid: Number(mid) || 0,
      name: `UID ${mid}`,
      avatar: '',
      isLogin: true,
      cookieSource: headerSource,
    };
  }
  return {
    mid: info.data.mid ?? Number(mid),
    name: info.data.name ?? '',
    avatar: info.data.face ?? '',
    desc: info.data.sign,
    level: info.data.level,
    isLogin: true,
    cookieSource: headerSource,
  };
}

export async function checkRefresh(): Promise<void> {
  if (!isBiliLoggedIn()) return;
  const { tryFetch } = await import('./http');
  const info = (await tryFetch(
    'https://passport.bilibili.com/x/passport-login/web/cookie/info',
    { ignoreErr: true },
  )) as { code?: number; data?: { refresh?: boolean; timestamp?: number } };
  if (info.code !== 0 || !info.data?.refresh) return;
  const ts = info.data.timestamp ?? Math.floor(Date.now() / 1000);
  const path = await correspondPath(ts);
  const html = (await tryFetch(`https://www.bilibili.com/correspond/1/${path}`, {
    type: 'text',
    ignoreErr: true,
  })) as string;
  const csrf = html.match(/<div id="1-name">(.+?)<\/div>/)?.[1];
  if (!csrf) throw new BiliError('无法获取 refresh_csrf');
  const bili_jct = pickCookie('bili_jct');
  const refresh = (await tryFetch(
    'https://passport.bilibili.com/x/passport-login/web/cookie/refresh',
    {
      post: { type: 'form' },
      params: {
        csrf: bili_jct,
        refresh_csrf: csrf,
        source: 'main_web',
        refresh_token: pickCookie('ac_time_value') || undefined,
      },
      ignoreErr: true,
    },
  )) as { code?: number; data?: { refresh_token?: string } };
  if (refresh.code !== 0) {
    throw new BiliError('Cookie 刷新失败', { code: refresh.code });
  }
  // 刷新后从 hub 重新同步（Set-Cookie 经 jar）
  await syncBiliSessionFromHub();
  clearWbiCache();
  await tryFetch(
    'https://passport.bilibili.com/x/passport-login/web/confirm/refresh',
    {
      post: { type: 'form' },
      params: {
        csrf: pickCookie('bili_jct'),
        refresh_token: refresh.data?.refresh_token,
      },
      ignoreErr: true,
    },
  );
}

export async function startQrLogin(): Promise<BiliQrLoginSession> {
  return createBiliQrLoginSession();
}

export async function pollQrLogin(session: BiliQrLoginSession): Promise<{
  done: boolean;
  message: string;
  cookies?: string;
}> {
  const result = await checkBiliQrLogin(session);
  const message = describeBiliQrStatus(result.code);
  if (result.code === 0 && result.cookies) {
    await applyPastedCookies(result.cookies);
    return { done: true, message, cookies: result.cookies };
  }
  if (result.code === 86038) {
    return { done: true, message };
  }
  return { done: false, message };
}

export { describeBiliQrStatus };
