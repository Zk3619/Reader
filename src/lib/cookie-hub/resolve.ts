/**
 * Cookie Hub 解析 / 发布
 */

import { getAuthSession } from '@/lib/database/audio-library';
import { persistAuthCookies } from '@/lib/media/audio/platform/auth/session';
import {
  getPersistentCookie,
  removeJarCookies,
  setPersistentCookie,
} from '@/lib/http/cookie-jar';
import {
  clearCachedCookies,
  peekCachedCookies,
  setCachedCookies,
} from './cache';
import {
  LEGACY_VIDEO_BILI_COOKIE_KEY,
  PLATFORM_COOKIE_URLS,
  VIDEO_BILI_OVERRIDE_KEY,
  type ResolvedCookies,
  type SharedPlatform,
} from './types';

function readLocal(key: string): string {
  try {
    return localStorage.getItem(key)?.trim() || '';
  } catch {
    return '';
  }
}

function writeLocal(key: string, value: string): void {
  try {
    if (!value.trim()) localStorage.removeItem(key);
    else localStorage.setItem(key, value.trim());
  } catch {
    /* */
  }
}

function readVideoOverride(platform: SharedPlatform): string {
  if (platform !== 'bili') return '';
  return readLocal(VIDEO_BILI_OVERRIDE_KEY);
}

/** 影视手填覆盖；空字符串清除覆盖（回退到音乐账号） */
export function setModuleCookieOverride(
  platform: SharedPlatform,
  cookies: string,
): void {
  if (platform !== 'bili') return;
  writeLocal(VIDEO_BILI_OVERRIDE_KEY, cookies);
  // 兼容旧键：有覆盖时镜像；清除覆盖时不删旧键（仍可作 legacy）
  if (cookies.trim()) {
    writeLocal(LEGACY_VIDEO_BILI_COOKIE_KEY, cookies.trim());
  }
  clearCachedCookies(platform);
}

export function getModuleCookieOverride(platform: SharedPlatform): string {
  return readVideoOverride(platform);
}

async function syncToHttpJar(
  platform: SharedPlatform,
  cookies: string,
): Promise<void> {
  const urls = PLATFORM_COOKIE_URLS[platform] ?? [];
  for (const url of urls) {
    try {
      if (cookies.trim()) await setPersistentCookie(url, cookies.trim());
    } catch (e) {
      console.warn('[cookie-hub] jar sync failed', platform, url, e);
    }
  }
}

/**
 * 解析某平台最终生效 Cookie（跨模块）
 * 注意：此处读 DB 须用 getAuthSession，禁止调 loadAuthSession（后者会再进本函数）。
 */
export async function resolveSharedCookies(
  platform: SharedPlatform,
): Promise<ResolvedCookies> {
  const override = readVideoOverride(platform);
  if (override) {
    const resolved: ResolvedCookies = {
      platform,
      cookies: override,
      source: 'module-override',
    };
    setCachedCookies(resolved);
    return resolved;
  }

  try {
    const session = await getAuthSession(platform);
    if (session?.cookies?.trim()) {
      const resolved: ResolvedCookies = {
        platform,
        cookies: session.cookies.trim(),
        source: 'platform-auth',
        updatedAt: session.updatedAt,
        healthy: session.healthy,
      };
      setCachedCookies(resolved);
      return resolved;
    }
  } catch (e) {
    console.warn('[cookie-hub] getAuthSession failed', platform, e);
  }

  if (platform === 'bili') {
    const legacy = readLocal(LEGACY_VIDEO_BILI_COOKIE_KEY);
    if (legacy) {
      const resolved: ResolvedCookies = {
        platform,
        cookies: legacy,
        source: 'legacy-local',
      };
      setCachedCookies(resolved);
      return resolved;
    }
  }

  try {
    const url = PLATFORM_COOKIE_URLS[platform]?.[0];
    if (url) {
      const jar = await getPersistentCookie(url);
      if (jar.trim()) {
        const resolved: ResolvedCookies = {
          platform,
          cookies: jar.trim(),
          source: 'http-jar',
        };
        setCachedCookies(resolved);
        return resolved;
      }
    }
  } catch (e) {
    console.warn('[cookie-hub] jar read failed', platform, e);
  }

  const empty: ResolvedCookies = { platform, cookies: '', source: 'none' };
  setCachedCookies(empty);
  return empty;
}

/**
 * 同步窥探（依赖 warm / 上次 resolve 缓存；无缓存时读覆盖与 legacy）
 */
export function peekSharedCookies(platform: SharedPlatform): string {
  const cached = peekCachedCookies(platform);
  if (cached) return cached.cookies;
  const override = readVideoOverride(platform);
  if (override) return override;
  if (platform === 'bili') return readLocal(LEGACY_VIDEO_BILI_COOKIE_KEY);
  return '';
}

export function peekSharedCookieSource(
  platform: SharedPlatform,
): ResolvedCookies['source'] {
  return peekCachedCookies(platform)?.source ?? 'none';
}

/**
 * 发布平台 Cookie：写入音乐账号库 + Jar + 缓存
 *（音乐扫码/粘贴登录后调用）
 */
export async function publishPlatformCookies(
  platform: SharedPlatform,
  cookies: string,
  opts?: { healthy?: boolean; alsoPersistAuth?: boolean },
): Promise<void> {
  const trimmed = cookies.trim();
  if (opts?.alsoPersistAuth !== false && trimmed) {
    await persistAuthCookies(platform, trimmed, opts?.healthy !== false);
  }
  if (trimmed) await syncToHttpJar(platform, trimmed);
  setCachedCookies({
    platform,
    cookies: trimmed,
    source: 'platform-auth',
    healthy: opts?.healthy !== false,
    updatedAt: Date.now(),
  });
  // 无影视覆盖时，镜像到旧键，便于尚未迁移的同步读取
  if (platform === 'bili' && trimmed && !readVideoOverride('bili')) {
    writeLocal(LEGACY_VIDEO_BILI_COOKIE_KEY, trimmed);
  }
}

/** 退出登录 / 清除平台 Cookie：缓存 + 覆盖 + Jar + bili 旧键 */
export async function clearPlatformCookies(platform: SharedPlatform): Promise<void> {
  clearCachedCookies(platform);
  if (platform === 'bili') {
    writeLocal(VIDEO_BILI_OVERRIDE_KEY, '');
    writeLocal(LEGACY_VIDEO_BILI_COOKIE_KEY, '');
  }
  const urls = PLATFORM_COOKIE_URLS[platform] ?? [];
  for (const url of urls) {
    try {
      await removeJarCookies(url);
    } catch (e) {
      console.warn('[cookie-hub] jar clear failed', platform, url, e);
    }
  }
  setCachedCookies({ platform, cookies: '', source: 'none' });
}

/** 预热缓存（App / TV 设置 / 播放前） */
export async function warmCookieHub(
  platforms: SharedPlatform[] = ['bili', 'netease', 'ytm'],
): Promise<void> {
  await Promise.all(platforms.map((p) => resolveSharedCookies(p)));
}

export function describeCookieSource(source: ResolvedCookies['source']): string {
  switch (source) {
    case 'module-override':
      return '影视手填覆盖';
    case 'platform-auth':
      return '音乐账号（共享）';
    case 'legacy-local':
      return '本地旧配置';
    case 'http-jar':
      return 'HTTP CookieJar';
    case 'site-pool':
      return '站点/书源 Cookie 池';
    default:
      return '未配置';
  }
}
