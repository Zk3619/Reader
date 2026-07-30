/**
 * Cookie Hub 人机验证编排：统一入口，引擎复用 cloudflare-verification。
 */

import type { BookSource } from '@/types';
import { HttpError } from '@/lib/http';
import {
  isCloudflareBlockedResponse,
  resolveCloudflareViaInnerWeb,
  shouldOfferCloudflareVerification,
} from '@/lib/http/cloudflare-verification';
import {
  bookSourceToSiteScope,
  siteScopeAsBookSource,
} from './site-scope';
import type { SiteScopeId } from './types';

export type EnsureSiteAccessOptions = {
  scope: SiteScopeId;
  url: string;
  blockedUrl?: string;
  title?: string;
  /** 已有 BookSource 时复用（保留 enabledCookieJar 等字段） */
  source?: BookSource;
};

export type WithSiteChallengeRetryOptions<T> = {
  scope: SiteScopeId;
  url: string;
  title?: string;
  source?: BookSource;
  /** 是否在挑战前再试一次 HTTP（对齐 enabledCookieJar） */
  retryHttpBeforeChallenge?: boolean;
  /** 验证成功、重试前回调（如对齐 CF 活跃域） */
  onVerified?: () => void;
  fetchOnce: () => Promise<T>;
  /** 成功响应是否仍为挑战页（默认检测 string body） */
  isBlockedResult?: (result: T) => boolean;
};

/**
 * 打开 InnerWeb 完成 CF 挑战；成功后 Cookie 已写入对应 SiteScope 后端。
 */
export async function ensureSiteAccess(
  opts: EnsureSiteAccessOptions,
): Promise<{ ok: boolean }> {
  const requestUrl = opts.url.trim();
  if (!requestUrl.startsWith('http')) return { ok: false };

  const source = siteScopeAsBookSource(opts.scope, requestUrl, opts.source);
  const title =
    opts.title?.trim() ||
    `Cloudflare 验证 — ${source.sourceName?.trim() || opts.scope.module}`;

  const ok = await resolveCloudflareViaInnerWeb({
    url: requestUrl,
    blockedUrl: opts.blockedUrl,
    source,
    title,
  });
  return { ok };
}

/**
 * 包装一次拉取：遇 CF 挑战则 ensureSiteAccess 后重试。
 */
export async function withSiteChallengeRetry<T>(
  opts: WithSiteChallengeRetryOptions<T>,
): Promise<T> {
  const isBlockedResult =
    opts.isBlockedResult ??
    ((result: T) =>
      typeof result === 'string' && isCloudflareBlockedResponse(200, result));

  const openCfAndRetry = async (cfError?: unknown): Promise<T> => {
    const blockedUrl = cfError instanceof HttpError ? cfError.url : undefined;
    const { ok } = await ensureSiteAccess({
      scope: opts.scope,
      url: opts.url,
      blockedUrl,
      title: opts.title,
      source: opts.source,
    });
    if (!ok) {
      throw new HttpError(
        403,
        'Forbidden',
        opts.url,
        'Cloudflare 验证未完成',
      );
    }
    opts.onVerified?.();
    return opts.fetchOnce();
  };

  try {
    let result = await opts.fetchOnce();
    if (isBlockedResult(result)) {
      result = await openCfAndRetry(undefined);
    }
    return result;
  } catch (e) {
    if (!shouldOfferCloudflareVerification(e)) throw e;
    if (opts.retryHttpBeforeChallenge) {
      try {
        let result = await opts.fetchOnce();
        if (isBlockedResult(result)) {
          result = await openCfAndRetry(undefined);
        }
        return result;
      } catch (retryErr) {
        if (!shouldOfferCloudflareVerification(retryErr)) throw retryErr;
        return openCfAndRetry(retryErr);
      }
    }
    return openCfAndRetry(e);
  }
}

/** 书源场景便捷封装 */
export async function withBookSourceChallengeRetry<T>(
  source: BookSource,
  url: string,
  fetchOnce: () => Promise<T>,
  opts?: {
    title?: string;
    onVerified?: () => void;
    isBlockedResult?: (result: T) => boolean;
  },
): Promise<T> {
  return withSiteChallengeRetry({
    scope: bookSourceToSiteScope(source),
    url,
    source,
    title: opts?.title,
    retryHttpBeforeChallenge: source.enabledCookieJar === true,
    onVerified: opts?.onVerified,
    fetchOnce,
    isBlockedResult: opts?.isBlockedResult,
  });
}
