/**
 * Cookie Hub 公共出口
 */

export type {
  CookieModuleId,
  CookieSourceKind,
  ResolvedCookies,
  SharedPlatform,
} from './types';
export {
  LEGACY_VIDEO_BILI_COOKIE_KEY,
  PLATFORM_COOKIE_URLS,
  VIDEO_BILI_OVERRIDE_KEY,
} from './types';
export {
  describeCookieSource,
  getModuleCookieOverride,
  peekSharedCookieSource,
  peekSharedCookies,
  publishPlatformCookies,
  resolveSharedCookies,
  setModuleCookieOverride,
  warmCookieHub,
} from './resolve';
export { clearCachedCookies, peekCachedCookies } from './cache';
