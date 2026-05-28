/**
 * 书源页面拉取统一入口：AnalyzeUrl（HTTP / WebView）+ Cookie
 */

import type { BookSource } from '@/types';
import { buildUrl } from '@/lib/book-source/utils';
import { fetchByAnalyzeUrl } from '@/lib/book-source/analyze-url';
import { resolveSourceCookiesForHttp } from '@/lib/book-source/source-http';
import { splitUrlAndOption, URL_OPTION_SPLIT } from '@/lib/book-source/analyze-url-option';
import { buildSourceRequestHeaders } from '@/lib/book-source/source-http';
import { get } from '@/lib/http';
import { assertLoginCheckPassed } from '@/lib/book-source/login-check';

export interface FetchSourcePageParams {
  /** 完整 ruleUrl（可含 ,{UrlOption}） */
  ruleUrl: string;
  source: BookSource;
  page?: number;
  keyword?: string;
  baseUrl?: string;
  /** 占位符：除 page 外 */
  placeholders?: Record<string, string>;
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
  const cookies = resolveSourceCookiesForHttp(params.source, urlPart);

  const fetched = await fetchByAnalyzeUrl({
    ruleUrl,
    source: params.source,
    keyword: params.keyword ?? '',
    page,
    baseUrl: params.baseUrl,
    cookies,
  });
  await assertLoginCheckPassed(params.source, fetched.body, fetched.url || urlPart);
  return fetched;
}

/** 章节 URL：含 UrlOption 时走 AnalyzeUrl，否则普通 GET */
export async function fetchChapterPageHtml(
  source: BookSource,
  chapterUrl: string,
  baseUrl?: string,
): Promise<string> {
  const trimmed = chapterUrl.trim();
  if (URL_OPTION_SPLIT.test(trimmed)) {
    const { body } = await fetchSourcePage({
      ruleUrl: trimmed,
      source,
      baseUrl,
    });
    return body;
  }

  const headers = buildSourceRequestHeaders(source, trimmed);
  const html = await get(trimmed, {
    headers,
    enableCookieJar: source.enabledCookieJar,
    concurrentRate: source.concurrentRate,
    timeout: 60_000,
  });
  await assertLoginCheckPassed(source, html, trimmed);
  return html;
}
