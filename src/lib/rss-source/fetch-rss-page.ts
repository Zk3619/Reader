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
  resolveCloudflareViaInnerWeb,
  shouldOfferCloudflareVerification,
} from '@/lib/http/cloudflare-verification';
import { HttpError } from '@/lib/http';
import { resolveUrl } from '@/lib/book-source/utils';
import { rssAsBookSource } from '@/lib/rss-source/rss-as-book-source';
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

/**
 * 按 AnalyzeUrl 拉取 RSS 正文页 HTML
 */
export async function fetchRssPage(params: FetchRssPageParams): Promise<FetchRssPageResult> {
  const book = rssAsBookSource(params.source);
  const pageUrl = resolveRssPageUrl(params.source, params.url, params.baseUrl);

  rssLog(params.source, 'AnalyzeUrl 请求', { url: pageUrl.slice(0, 200) });

  const buildParams = () => ({
    ruleUrl: pageUrl,
    source: book,
    baseUrl: params.baseUrl ?? resolveBookSourceRequestOrigin(book) ?? params.source.sourceUrl,
    cookies: resolveSourceCookiesForHttp(book, pageUrl),
  });

  const maybeRetryAfterCf = async (): Promise<FetchRssPageResult> => {
    const verified = await resolveCloudflareViaInnerWeb({
      url: pageUrl,
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
    return fetchByAnalyzeUrl(buildParams());
  };

  try {
    let fetched = await fetchByAnalyzeUrl(buildParams());
    if (!fetched.usedWebView && isCloudflareBlockedResponse(200, fetched.body)) {
      fetched = await maybeRetryAfterCf();
    }
    await assertLoginCheckPassed(book, fetched.body, fetched.url || pageUrl);
    rssLog(params.source, 'AnalyzeUrl 响应', {
      finalUrl: (fetched.url || pageUrl).slice(0, 200),
      bodyLength: fetched.body.length,
      usedWebView: fetched.usedWebView,
    });
    return fetched;
  } catch (e) {
    if (shouldOfferCloudflareVerification(e)) {
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
        return await maybeRetryAfterCf();
      } catch (cfErr) {
        rssError(params.source, 'CF 验证后仍失败', cfErr, { url: pageUrl.slice(0, 200) });
        throw cfErr;
      }
    }
    rssError(params.source, 'AnalyzeUrl 请求失败', e, { url: pageUrl.slice(0, 200) });
    throw e;
  }
}
