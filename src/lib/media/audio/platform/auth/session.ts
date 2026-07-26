/**
 * 平台账号认证（NeriPlayer 流程参考，TS 重写）
 * 网易云 / B 站主路径：扫码登录；WebView / 粘贴 Cookie 为兜底。
 */

import { getAuthSession, saveAuthSession } from '@/lib/database/audio-library';
import type { AudioAuthSession } from '@/lib/media/audio/track-types';
import { isMobile, isTauri } from '@/lib/platform/detect';

export type PlatformId = 'netease' | 'bili' | 'ytm';

const LOGIN_URLS: Record<PlatformId, string> = {
  netease: 'https://music.163.com/',
  bili: 'https://www.bilibili.com/',
  ytm: 'https://music.youtube.com/',
};

/** 对齐 NeriPlayer WebView：桌面 Chrome UA，避免移动端阉割页 */
const PLATFORM_LOGIN_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0';

export function getPlatformLoginUrl(platform: PlatformId): string {
  return LOGIN_URLS[platform];
}

export async function loadAuthSession(platform: PlatformId): Promise<AudioAuthSession | null> {
  return getAuthSession(platform);
}

export async function persistAuthCookies(
  platform: PlatformId,
  cookies: string,
  healthy = true,
): Promise<void> {
  if (platform === 'netease') {
    const { clearNeteaseUidCache } = await import('@/lib/media/audio/platform/api/netease');
    clearNeteaseUidCache();
  }
  await saveAuthSession({
    platform,
    cookies,
    updatedAt: Date.now(),
    healthy,
  });
  // 同步到 Cookie Hub，供影视弹幕等模块复用（不再二次写库）
  try {
    const { publishPlatformCookies } = await import('@/lib/cookie-hub');
    await publishPlatformCookies(platform, cookies, {
      healthy,
      alsoPersistAuth: false,
    });
  } catch (e) {
    console.warn('[auth] cookie-hub publish failed', platform, e);
  }
}

export async function clearAuthSession(platform: PlatformId): Promise<void> {
  if (platform === 'netease') {
    const { clearNeteaseUidCache } = await import('@/lib/media/audio/platform/api/netease');
    clearNeteaseUidCache();
  }
  await saveAuthSession({
    platform,
    cookies: '',
    updatedAt: Date.now(),
    healthy: false,
  });
}

/**
 * WebView / InnerWeb 登录。
 * - Tauri 桌面：强制原生 panel（禁止 iframe 回退，避免 X-Frame-Options 拦 music.163.com）
 * - 纯 Web：强制 __reader_http 文档代理剥 framing 头
 */
export async function openPlatformLogin(platform: PlatformId): Promise<string | null> {
  const url = getPlatformLoginUrl(platform);
  const { openInnerWebAwait } = await import('@/lib/platform/inner-web');
  const tauriDesktop = isTauri() && !isMobile();
  const result = await openInnerWebAwait({
    title: `${platform} 登录`,
    url,
    showConfirm: true,
    cookieSyncUrl: url,
    useProxyDocument: !isTauri(),
    forceTauriPanel: tauriDesktop,
    proxyForwardHeaders: {
      'User-Agent': PLATFORM_LOGIN_UA,
    },
  });
  if (result.cookies?.trim()) {
    const healthy = await cookiesLookHealthy(platform, result.cookies);
    await persistAuthCookies(platform, result.cookies, healthy);
    return result.cookies;
  }
  return null;
}

function cookiesLookHealthy(platform: PlatformId, cookies: string): boolean {
  if (platform === 'netease') {
    return /MUSIC_U\s*=\s*[^;\s]+/i.test(cookies);
  }
  if (platform === 'bili') {
    return /SESSDATA\s*=\s*[^;\s]+/i.test(cookies);
  }
  if (platform === 'ytm') {
    return (
      /SAPISID\s*=\s*[^;\s]+/i.test(cookies) ||
      /__Secure-3PSID\s*=\s*[^;\s]+/i.test(cookies) ||
      /__Secure-1PSID\s*=\s*[^;\s]+/i.test(cookies) ||
      /\bSID\s*=\s*[^;\s]+/i.test(cookies)
    );
  }
  return Boolean(cookies.trim());
}

export async function checkAuthHealth(platform: PlatformId): Promise<boolean> {
  const session = await getAuthSession(platform);
  if (!session?.cookies?.trim()) return false;
  if (platform === 'netease' || platform === 'bili' || platform === 'ytm') {
    return cookiesLookHealthy(platform, session.cookies);
  }
  return session.healthy;
}

export function cookiesFromManualInput(input: string): string {
  return input.trim().replace(/\s*;\s*/g, '; ');
}

/** 网易云扫码登录成功后持久化 Cookie */
export async function persistNeteaseQrCookies(cookies: string): Promise<void> {
  const healthy = /MUSIC_U\s*=\s*[^;\s]+/i.test(cookies);
  await persistAuthCookies('netease', cookies, healthy);
}

/** B 站扫码登录成功后持久化 Cookie */
export async function persistBiliQrCookies(cookies: string): Promise<void> {
  const healthy = /SESSDATA\s*=\s*[^;\s]+/i.test(cookies);
  await persistAuthCookies('bili', cookies, healthy);
}
