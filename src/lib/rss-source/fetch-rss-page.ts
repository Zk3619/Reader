/**
 * RSS 页面拉取：对齐 Legado Rss.getContentAwait / AnalyzeUrl
 */

import type { RssSource } from '@/types';
import { fetchByAnalyzeUrl } from '@/lib/book-source/analyze-url';
import { assertLoginCheckPassed } from '@/lib/book-source/login-check';
import {
  alignUrlToBookSourceRequestOrigin,
  resolveBookSourceRequestOrigin,
  resolveSourceCookiesForHttp,
} from '@/lib/book-source/source-http';
import {
  isCloudflareBlockedResponse,
  shouldOfferCloudflareVerification,
} from '@/lib/http/cloudflare-verification';
import { ensureSiteAccess, bookSourceToSiteScope } from '@/lib/cookie-hub';
import {
  isCfFetchRetryableError,
  type CfPanelWaitOptions,
} from '@/lib/book-source/cf-webview-fetch';
import { HttpError } from '@/lib/http';
import { resolveUrl } from '@/lib/book-source/utils';
import { rssAsBookSource } from '@/lib/rss-source/rss-as-book-source';
import { releaseCfDeferredInnerWebDismiss } from '@/lib/platform/inner-web';
import { rssError, rssLog } from '@/lib/rss-source/rss-source-logger';

export interface FetchRssPageParams {
  source: RssSource;
  /** 请求 URL（文章 link 或源地址） */
  url: string;
  /** 规则 baseUrl，默认 article.origin 或 sourceUrl */
  baseUrl?: string;
}

export interface FetchRssPageResult {
  body: string;
  url: string;
  usedWebView: boolean;
}

function resolveRssPageUrl(source: RssSource, url: string, baseUrl?: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    const book = rssAsBookSource(source);
    return alignUrlToBookSourceRequestOrigin(trimmed, book);
  }
  const base =
    baseUrl?.trim() ||
    resolveBookSourceRequestOrigin(rssAsBookSource(source)) ||
    source.sourceUrl;
  try {
    return alignUrlToBookSourceRequestOrigin(resolveUrl(base, trimmed), rssAsBookSource(source));
  } catch {
    return trimmed;
  }
}

/** 合并同源并发 AnalyzeUrl，避免双挂载/重复拉取导致一次成功一次超时 */
const inflightRssPages = new Map<string, Promise<FetchRssPageResult>>();

const RSS_PAGE_FETCH_TIMEOUT_MS = 60_000;

/** 从 ruleArticles 的 || 分支提取 CSS，供 panel 等待 SPA 列表渲染（不写死站点路径） */
export function resolveRssListPanelWait(
  source: RssSource,
): CfPanelWaitOptions | undefined {
  const rule = source.ruleArticles?.trim();
  if (!rule) return undefined;

  const selectors: string[] = [];
  for (const raw of rule.split('||')) {
    const part = raw.trim();
    if (!part || part.startsWith(':')) continue;
    const cssAll = part.match(/^@css:(.+?)@all$/i)?.[1]?.trim();
    if (cssAll) {
      selectors.push(cssAll);
      continue;
    }
    const className = part.match(/^class\.([^\s@|&.]+)/)?.[1]?.trim();
    if (className) {
      selectors.push(`.${className}`);
    }
  }

  if (selectors.length === 0) {
    return { selector: 'a[href]', minCount: 6, timeoutMs: 18_000 };
  }
  return { selector: selectors.join(', '), minCount: 4, timeoutMs: 18_000 };
}

function rssPageInflightKey(source: RssSource, pageUrl: string): string {
  return `${source.sourceUrl.trim()}\0${pageUrl}`;
}

/**
 * 按 AnalyzeUrl 拉取 RSS 正文页 HTML
 */
export async function fetchRssPage(params: FetchRssPageParams): Promise<FetchRssPageResult> {
  const pageUrl = resolveRssPageUrl(params.source, params.url, params.baseUrl);
  const inflightKey = rssPageInflightKey(params.source, pageUrl);
  const existing = inflightRssPages.get(inflightKey);
  if (existing) return existing;

  const promise = fetchRssPageOnce(params, pageUrl);
  inflightRssPages.set(inflightKey, promise);
  try {
    return await promise;
  } finally {
    if (inflightRssPages.get(inflightKey) === promise) {
      inflightRssPages.delete(inflightKey);
    }
  }
}

async function fetchRssPageOnce(
  params: FetchRssPageParams,
  pageUrl: string,
): Promise<FetchRssPageResult> {
  const book = rssAsBookSource(params.source);

  rssLog(params.source, 'AnalyzeUrl 请求', { url: pageUrl.slice(0, 200) });

  const buildParams = (requestUrl = pageUrl) => {
    const alignedUrl = alignUrlToBookSourceRequestOrigin(requestUrl, book);
    return {
      ruleUrl: alignedUrl,
      source: book,
      baseUrl:
        params.baseUrl?.trim() ||
        resolveBookSourceRequestOrigin(book) ||
        params.source.sourceUrl.trim(),
      cookies: resolveSourceCookiesForHttp(book, alignedUrl),
      timeoutMs: RSS_PAGE_FETCH_TIMEOUT_MS,
      cfPanelWait: resolveRssListPanelWait(params.source),
    };
  };

  const maybeRetryAfterCf = async (cfError?: unknown): Promise<FetchRssPageResult> => {
    const blockedUrl = cfError instanceof HttpError ? cfError.url : undefined;
    const { ok: verified } = await ensureSiteAccess({
      scope: bookSourceToSiteScope(book),
      url: pageUrl,
      blockedUrl,
      source: book,
    });
    if (!verified) {
      throw new HttpError(
        403,
        'Forbidden',
        pageUrl,
        '需要完成 Cloudflare 验证（未完成或 Cookie 未同步）',
      );
    }
    const retryParams = buildParams();
    rssLog(params.source, 'CF 验证后重试', {
      url: retryParams.ruleUrl.slice(0, 200),
      hasCfClearance: /cf_clearance=/i.test(retryParams.cookies ?? ''),
    });
    try {
      return await fetchByAnalyzeUrl(retryParams);
    } finally {
      releaseCfDeferredInnerWebDismiss();
    }
  };

  try {
    let fetched = await fetchByAnalyzeUrl(buildParams());
    if (!fetched.usedWebView && isCloudflareBlockedResponse(200, fetched.body)) {
      fetched = await maybeRetryAfterCf(undefined);
    }
    await assertLoginCheckPassed(book, fetched.body, fetched.url || pageUrl);
    rssLog(params.source, 'AnalyzeUrl 响应', {
      finalUrl: (fetched.url || pageUrl).slice(0, 200),
      bodyLength: fetched.body.length,
      usedWebView: fetched.usedWebView,
    });
    return fetched;
  } catch (e) {
    if (shouldOfferCloudflareVerification(e) || isCfFetchRetryableError(e)) {
      if (params.source.enabledCookieJar) {
        try {
          const fetched = await fetchByAnalyzeUrl(buildParams());
          await assertLoginCheckPassed(book, fetched.body, fetched.url || pageUrl);
          return fetched;
        } catch {
          /* 再试 CF 内嵌页 */
        }
      }
      try {
        return await maybeRetryAfterCf(e);
      } catch (cfErr) {
        rssError(params.source, 'CF 验证后仍失败', cfErr, { url: pageUrl.slice(0, 200) });
        throw cfErr;
      }
    }
    rssError(params.source, 'AnalyzeUrl 请求失败', e, { url: pageUrl.slice(0, 200) });
    throw e;
  }
}
