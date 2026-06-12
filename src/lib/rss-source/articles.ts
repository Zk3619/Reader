/**
 * RSS文章列表功能
 * 对应 legado 项目的 Rss.getArticles 和 RssParserByRule
 */

import { analyzeListElements, analyzeString, type RuleContext } from '@/lib/rule-engine';
import { loadHtmlForCss } from '@/lib/rule-engine/css-parser';
import { fetchRssPage } from '@/lib/rss-source/fetch-rss-page';
import type { RssSource } from '@/types';
import type { RssArticle, NewRssArticle } from '@/types';
import {
  invalidateLegadoRuleUrlExpandCache,
  resolveLegadoRuleUrl,
} from '@/lib/book-source/analyze-search-url';
import {
  clearSourceVerificationResultCache,
  isSourceVerificationCancelledError,
} from '@/lib/book-source/source-verification';
import { getLegadoSourceKey } from '@/lib/js-engine/legado/source-script-shared';
import { resolveUrl, detectContentType } from '@/lib/book-source/utils';
import { rssAsBookSource } from '@/lib/rss-source/rss-as-book-source';
import { parseRssDefault } from '@/lib/rss-source/rss-parser-default';
import { logRssArticleCoverParsed } from '@/lib/rss-source/rss-cover-image';
import { rssError, rssLog, rssWarn } from '@/lib/rss-source/rss-source-logger';

function isLikelyArticleImageUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('<') || trimmed.includes('href=') || trimmed.includes('%3C')) {
    return false;
  }
  if (/^data:image\//i.test(trimmed)) return true;
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith('//');
}

function inferElementContentType(element: string): 'html' | 'json' | 'text' {
  const trimmed = element.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      /* fall through */
    }
  }
  return 'html';
}

function looksLikeRelativeImagePath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^(\.?\.?\/|\/)/.test(trimmed)) return true;
  return /\.(jpe?g|png|gif|webp|svg|ico|bmp|avif)(\?|#|$)/i.test(trimmed);
}

/** 用 cheerio 统计列表相关 DOM，区分「正文含 album 字符串」与「可解析的 a[href]」 */
function inspectRssListDomHints(html: string) {
  try {
    const $ = loadHtmlForCss(html);
    return {
      anchorAlbumHints: $('a[href*="/album/"]').length,
      thumbOverlayHints: $('.thumb-overlay').length,
      videoTitleHints: $('.video-title').length,
      listColHints: $('.list-col').length,
    };
  } catch {
    return {
      anchorAlbumHints: 0,
      thumbOverlayHints: 0,
      videoTitleHints: 0,
      listColHints: 0,
    };
  }
}

function resolveArticleImageUrl(image: string | undefined, baseUrl: string): string | undefined {
  if (!image?.trim()) return undefined;
  const trimmed = image.trim();
  if (isLikelyArticleImageUrl(trimmed)) {
    return /^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:')
      ? trimmed
      : resolveUrl(baseUrl, trimmed);
  }
  if (!looksLikeRelativeImagePath(trimmed)) {
    return undefined;
  }
  const resolved = resolveUrl(baseUrl, trimmed);
  return isLikelyArticleImageUrl(resolved) ? resolved : undefined;
}

/**
 * 获取RSS文章列表
 */
export async function getRssArticles(
  source: RssSource,
  sortName: string,
  sortUrl: string,
  page: number = 1
): Promise<{ articles: RssArticle[]; nextUrl?: string }> {
  const startTime = Date.now();
  const parseMode = source.ruleArticles ? 'rule' : 'default-xml';

  try {
    const book = rssAsBookSource(source);
    const sourceKey = getLegadoSourceKey(book);
    invalidateLegadoRuleUrlExpandCache(book);
    clearSourceVerificationResultCache(sourceKey);
    // 展开 {{page}} 等；HTTP 请求须规范化编码，列表规则 baseUrl 须保留 wd 明文（对齐 Legado setBaseUrl(sortUrl)）
    const fetchUrl = await resolveLegadoRuleUrl(sortUrl, book, { page, preserveUrlOptions: true });
    const ruleBaseUrl = await resolveLegadoRuleUrl(sortUrl, book, { page, forRuleBase: true });

    rssLog(source, '请求文章列表', {
      sort: sortName || '默认',
      page,
      url: fetchUrl.slice(0, 200),
      parseMode,
      cookieJar: !!source.enabledCookieJar,
    });

    const { body: html } = await fetchRssPage({
      source,
      url: fetchUrl,
      baseUrl: source.sourceUrl,
    });

    const fetchMs = Date.now() - startTime;
    const contentType = detectContentType(html);

    rssLog(source, '列表响应', {
      fetchMs,
      contentType,
      bodyLength: html.length,
      bodyPreview: html.slice(0, 120),
    });

    if (!html.trim()) {
      rssWarn(source, '源站返回空正文，可能是源站异常或需要登录/Cookie', {
        url: fetchUrl.slice(0, 200),
      });
      return { articles: [] };
    }

    // 如果没有ruleArticles规则，使用默认RSS解析
    if (!source.ruleArticles) {
      const articles = parseRssDefault(html, sortName, source.sourceUrl, source);
      rssLog(source, '默认 XML 解析完成', {
        articleCount: articles.length,
        totalMs: Date.now() - startTime,
      });
      if (articles.length === 0) {
        rssWarn(source, '未解析到文章：检查是否为标准 RSS/Atom，或源站返回了 HTML 错误页', {
          contentType,
          bodyLength: html.length,
        });
      }
      return { articles };
    }

    const result = await parseRssByRule(
      source,
      sortName,
      ruleBaseUrl,
      html,
      contentType,
      fetchUrl,
    );
    rssLog(source, '规则解析完成', {
      articleCount: result.articles.length,
      hasNextPage: !!result.nextUrl,
      totalMs: Date.now() - startTime,
    });
    if (result.articles.length === 0) {
      const domHints = inspectRssListDomHints(html);
      rssWarn(source, '规则解析到 0 篇文章：检查 ruleArticles 等规则，或源站结构已变更', {
        ruleArticles: source.ruleArticles.slice(0, 120),
        contentType,
        bodyLength: html.length,
        listItemCount: result.listItemCount,
        skippedNoTitle: result.skippedNoTitle,
        albumLinkHints: (html.match(/\/album\/\d+/g) || []).length,
        ...domHints,
      });
    }
    return { articles: result.articles, nextUrl: result.nextUrl };
  } catch (error) {
    if (isSourceVerificationCancelledError(error)) {
      throw error;
    }
    rssError(source, '获取文章列表失败', error, {
      sort: sortName || '默认',
      page,
      parseMode,
      totalMs: Date.now() - startTime,
    });
    return { articles: [] };
  }
}

/**
 * 使用规则解析RSS文章列表
 */
async function parseRssByRule(
  source: RssSource,
  sortName: string,
  baseUrl: string,
  content: string,
  contentType: 'html' | 'json' | 'text',
  fetchUrl?: string,
): Promise<{
  articles: RssArticle[];
  nextUrl?: string;
  listItemCount?: number;
  skippedNoTitle?: number;
}> {
  // 检查是否需要倒序
  let ruleArticles = source.ruleArticles || '';
  let reverse = false;
  if (ruleArticles.startsWith('-')) {
    reverse = true;
    ruleArticles = ruleArticles.substring(1);
  }

  const book = rssAsBookSource(source);
  // 规则 baseUrl 须为 forRuleBase 明文（baidu wd=♞♞《》 等）；fetchUrl 仅用于 HTTP 拉取
  const ruleBaseUrl = baseUrl.trim() || fetchUrl?.trim() || '';

  // 创建规则上下文（对齐 fetchByAnalyzeUrl：bookSource + Cookie 键一致）
  const context: RuleContext = {
    content,
    contentType,
    baseUrl: ruleBaseUrl,
    source: book as unknown as Record<string, unknown>,
  };

  // 获取文章列表元素
  const listItems = await analyzeListElements(ruleArticles, context);

  // 解析下一页URL
  let nextUrl: string | undefined;
  if (source.ruleNextPage) {
    if (source.ruleNextPage.toUpperCase() === 'PAGE') {
      nextUrl = baseUrl;
    } else {
      const parsedNextUrl = await analyzeString(source.ruleNextPage, context);
      if (parsedNextUrl) {
        nextUrl = resolveUrl(baseUrl, parsedNextUrl);
      }
    }
  }

  // 解析每个文章
  const articles: RssArticle[] = [];
  let skippedNoTitle = 0;
  for (let index = 0; index < listItems.length; index++) {
    const element = listItems[index].content;
    const elementContext: RuleContext = {
      content: element,
      contentType: inferElementContentType(element),
      baseUrl,
      source: source as unknown as Record<string, unknown>,
      regexGroups: listItems[index].regexGroups,
    };

    const article = await parseRssArticle(source, elementContext, ruleBaseUrl, sortName, index);
    if (article) {
      articles.push(article);
    } else {
      skippedNoTitle += 1;
    }
  }

  // 如果需要倒序
  if (reverse) {
    articles.reverse();
  }

  return {
    articles,
    nextUrl,
    listItemCount: listItems.length,
    skippedNoTitle,
  };
}

/**
 * 解析单个RSS文章
 */
async function parseRssArticle(
  source: RssSource,
  context: RuleContext,
  baseUrl: string,
  sortName: string,
  order: number
): Promise<RssArticle | null> {
  try {
    // 解析标题
    const title = source.ruleTitle
      ? await analyzeString(source.ruleTitle, context)
      : '';

    if (!title) {
      return null;
    }

    // 解析链接
    let link = '';
    if (source.ruleLink) {
      const parsedLink = await analyzeString(source.ruleLink, context);
      if (parsedLink) {
        link = resolveUrl(baseUrl, parsedLink);
      }
    }

    // 解析其他字段
    const pubDate = source.rulePubDate
      ? await analyzeString(source.rulePubDate, context)
      : undefined;
    const description = source.ruleDescription
      ? await analyzeString(source.ruleDescription, context)
      : undefined;
    const image = source.ruleImage
      ? await analyzeString(source.ruleImage, context)
      : undefined;

    const imageUrl = resolveArticleImageUrl(image, baseUrl);

    logRssArticleCoverParsed(source, title, imageUrl);

    return {
      origin: source.sourceUrl,
      link: link || baseUrl,
      sort: sortName,
      title: title.trim(),
      order,
      pubDate,
      description,
      image: imageUrl,
      group: '默认分组',
      read: false,
      type: 0,
      durPos: 0,
    };
  } catch (error) {
    rssError(source, '解析单篇文章失败', error, { sort: sortName, order });
    return null;
  }
}

/**
 * 将RssArticle转换为NewRssArticle（用于数据库插入）
 */
export function toNewRssArticle(article: RssArticle): NewRssArticle {
  return {
    origin: article.origin,
    link: article.link,
    sort: article.sort,
    title: article.title,
    order: article.order,
    pubDate: article.pubDate,
    description: article.description,
    content: article.content,
    image: article.image,
    group: article.group,
    read: article.read,
    variable: article.variable,
  };
}
