/**
 * 番剧反爬：检索阶段仍抛 CaptchaRequiredError（对齐 Kazumi，不打断批量搜）。
 * 用户主动过验证时走 Cookie Hub SiteScope + InnerWeb。
 */

import { isAndroid, isTauri } from '@/lib/platform/detect';
import type { BangumiAntiCrawler } from '@/lib/media/video/bangumi/rules';
import {
  ensureSiteAccess,
  makeBangumiScope,
  resolveSiteCookies,
} from '@/lib/cookie-hub';

export class CaptchaRequiredError extends Error {
  constructor(public pageUrl: string) {
    super(`需要验证码: ${pageUrl}`);
    this.name = 'CaptchaRequiredError';
  }
}

/**
 * 用户主动完成站点人机验证（设置/错误重试入口）。
 * 检索/抽流请勿自动调用，以免打断无头体验。
 */
export async function openAntiCrawlerSession(
  pageUrl: string,
  opts?: {
    ruleId?: string;
    baseUrl?: string;
    title?: string;
    cfg?: BangumiAntiCrawler;
  },
  _timeoutMs = 90000,
): Promise<boolean> {
  const url = pageUrl.trim();
  if (!url.startsWith('http')) return false;
  if (!isTauri() && typeof window === 'undefined') return false;
  if (isAndroid() && !isTauri()) {
    /* 纯 Android Web 仍可走 iframe 代理验证 */
  }

  const scope = makeBangumiScope(opts?.ruleId || 'manual', opts?.baseUrl || url);
  const { ok } = await ensureSiteAccess({
    scope,
    url,
    title: opts?.title?.trim() || `番剧站点验证 — ${scope.scopeKey}`,
  });
  return ok;
}

/** 读取某番剧规则站点已缓存的 Cookie（供后续请求注入） */
export function peekBangumiSiteCookies(ruleId: string, pageUrl: string): string {
  const scope = makeBangumiScope(ruleId, pageUrl);
  return resolveSiteCookies(scope, pageUrl).cookies;
}
