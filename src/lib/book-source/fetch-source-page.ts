/**
 * 书源页面拉取统一入口：AnalyzeUrl（HTTP / WebView）+ Cookie
 */

import type { BookSource } from '@/types';
import {
  buildUrl,
  legadoDataUrlRuleBody,
  splitLegadoUrlOptions,
  decodeDataUriBase64Payload,
  legadoHexEncodeBytes,
} from '@/lib/book-source/utils';
import { fetchByAnalyzeUrl } from '@/lib/book-source/analyze-url';
import {
  alignUrlToBookSourceRequestOrigin,
  resolveBookSourceRequestOrigin,
  resolveSourceCookiesForHttp,
} from '@/lib/book-source/source-http';
import { splitUrlAndOption, URL_OPTION_SPLIT } from '@/lib/book-source/analyze-url-option';
import { isAtomicLegadoScriptRule } from '@/lib/rule-engine/legado-source-rule';
import { HttpError } from '@/lib/http';
import { getBookSourcePage } from '@/lib/book-source/source-http-cf';
import { assertLoginCheckPassed } from '@/lib/book-source/login-check';
import type { ScriptNoticeBus } from '@/lib/book-source/rate-limit-guard';
import {
  isCloudflareBlockedResponse,
  resolveCloudflareViaInnerWeb,
  shouldOfferCloudflareVerification,
} from '@/lib/http/cloudflare-verification';

export interface FetchSourcePageParams {
  /** 完整 ruleUrl（可含 ,{UrlOption}） */
  ruleUrl: string;
  source: BookSource;
  page?: number;
  keyword?: string;
  baseUrl?: string;
  /** 占位符：除 page 外 */
  placeholders?: Record<string, string>;
  /** 统一脚本通知总线（toast + HTML 限流拦截） */
  scriptNotice?: ScriptNoticeBus;
}

/**
 * 展开 {{page}} 等后按 AnalyzeUrl 拉取正文
 */
export async function fetchSourcePage(params: FetchSourcePageParams): Promise<{
  body: string;
  url: string;
  usedWebView: boolean;
}> {
  const page = params.page ?? 1;
  let ruleUrl = params.ruleUrl.trim();

  const ph: Record<string, string> = {
    page: String(page),
    ...params.placeholders,
  };
  ruleUrl = buildUrl(ruleUrl, ph);

  const { urlPart } = splitUrlAndOption(ruleUrl);

  const resolvePageUrl = () => {
    if (isAtomicLegadoScriptRule(urlPart)) return urlPart;
    try {
      const base =
        params.baseUrl ||
        resolveBookSourceRequestOrigin(params.source) ||
        params.source.sourceUrl ||
        urlPart;
      let href = urlPart;
      if (/^https?:\/\//i.test(urlPart)) href = urlPart;
      else if (base?.startsWith('http')) href = new URL(urlPart, base).href;
      else href = params.source.sourceUrl?.trim() || urlPart;
      return alignUrlToBookSourceRequestOrigin(href, params.source);
    } catch {
      /* ignore */
    }
    const fallback = params.source.sourceUrl?.trim() || urlPart;
    return alignUrlToBookSourceRequestOrigin(fallback, params.source);
  };

  /** 每次请求前重读书源 Cookie 池（CF √ 后须刷新，勿复用旧快照） */
  const buildAnalyzeParams = () => {
    const pageUrl = resolvePageUrl();
    const { optionsJson } = splitUrlAndOption(ruleUrl);
    const alignedRuleUrl =
      optionsJson?.trim() ? `${pageUrl},${optionsJson}` : pageUrl;
    return {
      ruleUrl: alignedRuleUrl,
      source: params.source,
      keyword: params.keyword ?? '',
      page,
      baseUrl: resolveBookSourceRequestOrigin(params.source) || params.baseUrl,
      cookies: resolveSourceCookiesForHttp(params.source, pageUrl),
      scriptNotice: params.scriptNotice,
      onScriptToast: params.scriptNotice?.onScriptToast,
    };
  };

  const maybeRetryAfterCf = async (cfError?: unknown): Promise<{
    body: string;
    url: string;
    usedWebView: boolean;
  }> => {
    const target = resolvePageUrl();
    const blockedUrl = cfError instanceof HttpError ? cfError.url : undefined;
    const verified = await resolveCloudflareViaInnerWeb({
      url: target,
      blockedUrl,
      source: params.source,
    });
    if (!verified) {
      throw new HttpError(
        403,
        'Forbidden',
        target,
        '需要完成 Cloudflare 验证（未完成或 Cookie 未同步）',
      );
    }
    return fetchByAnalyzeUrl(buildAnalyzeParams());
  };

  try {
    let fetched = await fetchByAnalyzeUrl(buildAnalyzeParams());
    const pageUrl = fetched.url || urlPart;
    if (
      !fetched.usedWebView &&
      isCloudflareBlockedResponse(200, fetched.body)
    ) {
      fetched = await maybeRetryAfterCf(undefined);
    }
    await assertLoginCheckPassed(params.source, fetched.body, pageUrl);
    return fetched;
  } catch (e) {
    if (shouldOfferCloudflareVerification(e)) {
      if (params.source.enabledCookieJar) {
        try {
          const fetched = await fetchByAnalyzeUrl(buildAnalyzeParams());
          await assertLoginCheckPassed(params.source, fetched.body, fetched.url || urlPart);
          return fetched;
        } catch {
          /* 对齐 Legado：首包 403 已写入 Set-Cookie，再试一次；仍失败则开内嵌页 */
        }
      }
      const fetched = await maybeRetryAfterCf(e);
      await assertLoginCheckPassed(params.source, fetched.body, fetched.url || urlPart);
      return fetched;
    }
    throw e;
  }
}

/** 章节 URL：含 UrlOption 时走 AnalyzeUrl，否则普通 GET */
export async function fetchChapterPageHtml(
  source: BookSource,
  chapterUrl: string,
  baseUrl?: string,
  scriptNotice?: ScriptNoticeBus,
): Promise<string> {
  const trimmed = chapterUrl.trim();
  if (/^data:/i.test(trimmed)) {
    const hex = legadoDataUrlRuleBody(trimmed);
    if (hex != null) return hex;
    const { urlNoOption } = splitLegadoUrlOptions(trimmed);
    const bytes = decodeDataUriBase64Payload(urlNoOption);
    if (bytes?.length) {
      return legadoHexEncodeBytes(bytes);
    }
    return '';
  }
  if (URL_OPTION_SPLIT.test(trimmed)) {
    const { body } = await fetchSourcePage({
      ruleUrl: trimmed,
      source,
      baseUrl,
      scriptNotice,
    });
    return body;
  }

  const html = await getBookSourcePage(source, trimmed, {
    timeout: 60_000,
  });
  await assertLoginCheckPassed(source, html, trimmed);
  return html;
}
