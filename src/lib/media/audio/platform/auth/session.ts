/**
 * 平台账号认证（NeriPlayer 流程参考，TS 重写）
 */

import { getAuthSession, saveAuthSession } from '@/lib/database/audio-library';
import type { AudioAuthSession } from '@/lib/media/audio/track-types';

export type PlatformId = 'netease' | 'bili' | 'ytm';

const LOGIN_URLS: Record<PlatformId, string> = {
  netease: 'https://music.163.com/',
  bili: 'https://www.bilibili.com/',
  ytm: 'https://music.youtube.com/',
};

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
  await saveAuthSession({
    platform,
    cookies,
    updatedAt: Date.now(),
    healthy,
  });
}

export async function clearAuthSession(platform: PlatformId): Promise<void> {
  await saveAuthSession({
    platform,
    cookies: '',
    updatedAt: Date.now(),
    healthy: false,
  });
}

export async function openPlatformLogin(platform: PlatformId): Promise<string | null> {
  const url = getPlatformLoginUrl(platform);
  const { openInnerWebAwait } = await import('@/lib/platform/inner-web');
  const result = await openInnerWebAwait({
    title: `${platform} 登录`,
    url,
    showConfirm: true,
    cookieSyncUrl: url,
  });
  if (result.cookies?.trim()) {
    await persistAuthCookies(platform, result.cookies, true);
    return result.cookies;
  }
  return null;
}

export async function checkAuthHealth(platform: PlatformId): Promise<boolean> {
  const session = await getAuthSession(platform);
  if (!session?.cookies?.trim()) return false;
  if (platform === 'netease') {
    return session.cookies.includes('MUSIC_U') || session.cookies.includes('music_u');
  }
  return session.healthy;
}

export function cookiesFromManualInput(input: string): string {
  return input.trim().replace(/\s*;\s*/g, '; ');
}
