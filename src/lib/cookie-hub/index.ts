/**
 * Cookie Hub 公共出口
 */

export type {
  CookieModuleId,
  CookieSourceKind,
  ResolvedCookies,
  ResolvedSiteCookies,
  SharedPlatform,
  SiteScopeId,
} from './types';
export {
  LEGACY_VIDEO_BILI_COOKIE_KEY,
  PLATFORM_COOKIE_URLS,
  SUBSCRIBE_SCOPE_SUFFIX,
  VIDEO_BILI_OVERRIDE_KEY,
  subscribeSiteScopeKey,
} from './types';
export {
  clearPlatformCookies,
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
export {
  bookSourceToSiteScope,
  makeBangumiScope,
  makeDoubanScope,
  makeSubscribeScope,
  publishSiteCookies,
  resolveSiteCookies,
  siteScopeAsBookSource,
} from './site-scope';
export {
  ensureSiteAccess,
  withBookSourceChallengeRetry,
  withSiteChallengeRetry,
  type EnsureSiteAccessOptions,
  type WithSiteChallengeRetryOptions,
} from './challenge';
