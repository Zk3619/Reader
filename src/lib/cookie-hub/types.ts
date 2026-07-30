/**
 * Cookie Hub：跨模块统一 Cookie 协调层
 *
 * 双层模型：
 * 1. SharedPlatform（bili/netease/ytm）— 账号级跨模块共享
 * 2. SiteScope（module + scopeKey）— 站点/书源隔离；阅读按 bookSourceUrl
 *
 * 人机验证经 challenge 编排 API，引擎仍复用 cloudflare-verification。
 */

export type SharedPlatform = 'bili' | 'netease' | 'ytm';

export type CookieSourceKind =
  | 'module-override'
  | 'platform-auth'
  | 'legacy-local'
  | 'http-jar'
  | 'site-pool'
  | 'none';

export type CookieModuleId = 'music' | 'video' | 'reader' | 'subscribe' | 'shared';

/** 站点/书源 scope：阅读用 bookSourceUrl；订阅用 `{origin}/#reader-subscribe` */
export type SiteScopeId = {
  module: CookieModuleId;
  scopeKey: string;
};

export type ResolvedCookies = {
  platform: SharedPlatform;
  cookies: string;
  source: CookieSourceKind;
  updatedAt?: number;
  healthy?: boolean;
};

export type ResolvedSiteCookies = {
  scope: SiteScopeId;
  cookies: string;
  source: CookieSourceKind;
  cfOrigin?: string;
  panelUa?: string;
  updatedAt?: number;
};

/** 平台 → 代表性 URL（写入/读取 CookieJar 用） */
export const PLATFORM_COOKIE_URLS: Record<SharedPlatform, string[]> = {
  bili: [
    'https://www.bilibili.com/',
    'https://api.bilibili.com/',
    'https://comment.bilibili.com/',
  ],
  netease: ['https://music.163.com/'],
  ytm: ['https://music.youtube.com/', 'https://www.youtube.com/'],
};

/** 影视模块覆盖键（手填优先于音乐账号） */
export const VIDEO_BILI_OVERRIDE_KEY = 'reader.cookie-hub.video.bili.override.v1';

/** 旧弹幕 localStorage 键（只读回退） */
export const LEGACY_VIDEO_BILI_COOKIE_KEY = 'reader.video.bili.cookie.v1';

/** 订阅模块 SiteScope 后缀（与临时 BookSource 约定一致） */
export const SUBSCRIBE_SCOPE_SUFFIX = '#reader-subscribe';

export function subscribeSiteScopeKey(originOrUrl: string): string {
  let origin = originOrUrl.trim();
  try {
    if (/^https?:\/\//i.test(origin)) origin = new URL(origin).origin;
  } catch {
    /* keep */
  }
  return `${origin.replace(/\/+$/, '')}/${SUBSCRIBE_SCOPE_SUFFIX}`;
}
