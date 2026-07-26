/**
 * Cookie Hub：跨模块统一 Cookie 协调层
 *
 * 优先级（共享平台，如 bili）：
 * 1. 模块覆盖（影视设置手填等）
 * 2. 平台账号（音乐 SQLite audio_auth_sessions）
 * 3. 兼容旧键（localStorage）
 * 4. HTTP CookieJar（按域名）
 *
 * 书源仍用 source-cookie-pool（按源 URL 隔离）；需要平台 Cookie 时调本 hub。
 */

export type SharedPlatform = 'bili' | 'netease' | 'ytm';

export type CookieSourceKind =
  | 'module-override'
  | 'platform-auth'
  | 'legacy-local'
  | 'http-jar'
  | 'none';

export type CookieModuleId = 'music' | 'video' | 'reader' | 'subscribe' | 'shared';

export type ResolvedCookies = {
  platform: SharedPlatform;
  cookies: string;
  source: CookieSourceKind;
  updatedAt?: number;
  healthy?: boolean;
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
