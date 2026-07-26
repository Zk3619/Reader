/**
 * 同步缓存：供 getBiliCookie() 等同步 API 读取。
 * 由 warmCookieHub / publishPlatformCookies / resolve 成功后写入。
 */

import type { ResolvedCookies, SharedPlatform } from './types';

const cache = new Map<SharedPlatform, ResolvedCookies>();

export function peekCachedCookies(platform: SharedPlatform): ResolvedCookies | null {
  return cache.get(platform) ?? null;
}

export function setCachedCookies(resolved: ResolvedCookies): void {
  cache.set(resolved.platform, resolved);
}

export function clearCachedCookies(platform?: SharedPlatform): void {
  if (platform) cache.delete(platform);
  else cache.clear();
}
