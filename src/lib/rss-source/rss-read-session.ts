/**
 * RSS 阅读会话：对齐 Legado ReadRssViewModel 三种加载模式
 */

import type { RssArticle, RssSource } from '@/types';
import { resolveUrl } from '@/lib/book-source/utils';
import { buildSourceRequestHeaders } from '@/lib/book-source/source-http';
import { analyzeString, type RuleContext } from '@/lib/rule-engine';
import { processContent } from '@/lib/book-source/content-processor';
import { getStoredSourceCookiesForInnerWeb } from '@/lib/js-engine';
import { fetchRssPage } from '@/lib/rss-source/fetch-rss-page';
import { wrapRssHtmlForWebView, wrapRssStartHtml } from '@/lib/rss-source/rss-html';
import { createInnerWebProxySession } from '@/lib/http/inner-web-proxy-session';
import { rssContentNeedsAssetProxy } from '@/lib/rss-source/rss-content-image-proxy';
import { rssAsBookSource } from '@/lib/rss-source/rss-as-book-source';
import { rssError, rssLog, rssWarn } from '@/lib/rss-source/rss-source-logger';
import { evalJs } from '@/lib/js-engine';

export type RssReadLoadMode = 'content' | 'url' | 'startHtml';

export interface RssReadSession {
  mode: RssReadLoadMode;
  /** 文档 baseUrl（loadDataWithBaseURL） */
  documentBaseUrl: string | null;
  /** 历史/收藏记录用 */
  pageUrl: string;
  /** content / startHtml 模式的 HTML */
  html?: string;
  /** url 模式直接加载 */
  directUrl?: string;
  cookies: string;
  headers: Record<string, string>;
  enableJs: boolean;
  injectJs?: string;
  title: string;
  /** content 模式图片代理会话（预创建，避免 WebView 空转） */
  contentProxySessionId?: string;
}

export interface PrepareRssReadSessionParams {
  source: RssSource;
  article?: RssArticle | null;
  /** 无文章时打开源（singleUrl / startHtml） */
  openUrl?: string;
  /** 强制 startHtml 模式 */
  useStartHtml?: boolean;
}

function absoluteArticleUrl(article: RssArticle): string {
  const link = article.link.trim();
  if (/^https?:\/\//i.test(link)) return link.split('@js')[0]!;
  return resolveUrl(article.origin || '', link).split('@js')[0]!;
}

async function resolveStartHtml(source: RssSource): Promise<string | null> {
  const raw = source.startHtml?.trim();
  if (!raw) return null;
  if (raw.startsWith('@js:')) {
    return String(
      (await evalJs(raw.slice(4), {
        result: '',
        baseUrl: source.sourceUrl,
        source: source as unknown as Record<string, unknown>,
        bookSource: rssAsBookSource(source),
      })) ?? '',
    );
  }
  if (raw.startsWith('<js>') && raw.endsWith('>')) {
    const inner = raw.slice(4, -1);
    return String(
      (await evalJs(inner, {
        result: '',
        baseUrl: source.sourceUrl,
        source: source as unknown as Record<string, unknown>,
        bookSource: rssAsBookSource(source),
      })) ?? '',
    );
  }
  return raw;
}

function buildSessionHeaders(source: RssSource, pageUrl: string): Record<string, string> {
  return buildSourceRequestHeaders(rssAsBookSource(source), pageUrl);
}

function sessionCookies(source: RssSource, pageUrl: string): string {
  return getStoredSourceCookiesForInnerWeb(rssAsBookSource(source), pageUrl);
}

async function resolveContentProxySessionId(
  pageUrl: string,
  cookies: string,
  headers: Record<string, string>,
): Promise<string | undefined> {
  if (typeof window === 'undefined') return undefined;
  if (!rssContentNeedsAssetProxy({ pageUrl, cookies, headers })) return undefined;
  try {
    return await createInnerWebProxySession(pageUrl, cookies, headers);
  } catch (e) {
    console.warn('[rss-read-session] 正文代理会话失败', pageUrl, e);
    return undefined;
  }
}

/**
 * 拉取并解析 ruleContent 正文
 */
export async function fetchRssArticleContent(
  source: RssSource,
  article: RssArticle,
): Promise<string | null> {
  const ruleContent = source.ruleContent?.trim();
  if (!ruleContent) return null;

  const articleUrl = absoluteArticleUrl(article);
  const baseUrl = resolveUrl(article.origin || source.sourceUrl, article.link);

  try {
    const { body, url: finalUrl } = await fetchRssPage({
      source,
      url: articleUrl,
      baseUrl: article.origin || source.sourceUrl,
    });

    if (!body.trim()) {
      rssWarn(source, '正文页为空', { link: articleUrl.slice(0, 200) });
      return null;
    }

    const context: RuleContext = {
      content: body,
      contentType: body.trim().startsWith('{') ? 'json' : 'html',
      baseUrl,
      result: body,
      variables: { redirectUrl: finalUrl },
      source: source as unknown as Record<string, unknown>,
    };

    let content = await analyzeString(ruleContent, context);
    if (!content?.trim()) {
      rssWarn(source, 'ruleContent 解析为空', { link: articleUrl.slice(0, 200) });
      return null;
    }

    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    content = await processContent(content, article.title, source.sourceUrl);
    rssLog(source, '正文解析完成', {
      length: content.length,
      hasScript: /<script[\s>]/i.test(content),
      hasImgList: /id=["']imgList["']/i.test(content),
    });
    return content;
  } catch (e) {
    rssError(source, '正文拉取失败', e, { link: articleUrl.slice(0, 200) });
    return null;
  }
}

/**
 * 构建阅读 WebView 会话（content / url / startHtml）
 */
export async function prepareRssReadSession(
  params: PrepareRssReadSessionParams,
): Promise<RssReadSession> {
  const { source } = params;
  const book = rssAsBookSource(source);
  const enableJs = source.enableJs !== false;

  // startHtml 入口（无文章或显式指定）
  if (params.useStartHtml || (!params.article && !params.openUrl)) {
    const startRaw = await resolveStartHtml(source);
    if (startRaw?.trim()) {
      const pageUrl = source.sourceUrl;
      const html = wrapRssStartHtml(source, startRaw);
      return {
        mode: 'startHtml',
        documentBaseUrl: source.loadWithBaseUrl ? source.sourceUrl : null,
        pageUrl,
        html,
        cookies: sessionCookies(source, pageUrl),
        headers: buildSessionHeaders(source, pageUrl),
        enableJs,
        injectJs: source.injectJs?.trim() || undefined,
        title: source.sourceName,
      };
    }
  }

  const article = params.article;
  const openUrl = params.openUrl?.trim();
  const pageUrl = article
    ? absoluteArticleUrl(article)
    : openUrl || source.sourceUrl;
  const title = article?.title ?? source.sourceName;

  const ruleContent = source.ruleContent?.trim();
  const useUrlMode = !ruleContent || source.singleUrl;

  if (!useUrlMode && article) {
    const rawContent = await fetchRssArticleContent(source, article);
    if (rawContent?.trim()) {
      const docBase = source.loadWithBaseUrl === false ? null : pageUrl;
      const html = wrapRssHtmlForWebView(rawContent, source, source.style);
      const cookies = sessionCookies(source, pageUrl);
      const headers = buildSessionHeaders(source, pageUrl);
      const contentProxySessionId = await resolveContentProxySessionId(
        pageUrl,
        cookies,
        headers,
      );
      return {
        mode: 'content',
        documentBaseUrl: docBase,
        pageUrl,
        html,
        cookies,
        headers,
        enableJs,
        injectJs: source.injectJs?.trim() || undefined,
        title,
        contentProxySessionId,
      };
    }
    rssWarn(source, '正文失败，回退直链模式', { link: pageUrl.slice(0, 200) });
  }

  // url 模式：WebView 直接加载原文
  const directUrl = pageUrl;
  return {
    mode: 'url',
    documentBaseUrl: null,
    pageUrl: directUrl,
    directUrl,
    cookies: sessionCookies(source, directUrl),
    headers: buildSourceRequestHeaders(book, directUrl),
    enableJs,
    injectJs: source.injectJs?.trim() || undefined,
    title,
  };
}
