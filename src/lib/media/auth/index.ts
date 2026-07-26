/**
 * 跨模块媒体认证入口（re-export）
 * 音乐 / 影视 / 后续 yt-dlp 统一从此取 Cookie 与 Headers。
 * 共享平台 Cookie 请优先用 `@/lib/cookie-hub`。
 */

export * from '@/lib/media/auth/platform-credentials';
export {
  resolveSharedCookies,
  peekSharedCookies,
  warmCookieHub,
  publishPlatformCookies,
} from '@/lib/cookie-hub';
