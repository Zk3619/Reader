/**
 * RSS文章列表功能
 * 对应 legado 项目的 Rss.getArticles 和 RssParserByRule
 */

import { get } from '@/lib/http';
import { analyzeString, analyzeStringList, type RuleContext } from '@/lib/rule-engine';
import type { RssSource } from '@/types';
import type { RssArticle, NewRssArticle } from '@/types';
import { parseHeaders, resolveUrl, detectContentType, buildUrl } from '@/lib/book-source/utils';
import { parseRssDefault } from '@/lib/rss-source/rss-parser-default';

/**
 * 获取RSS文章列表
 */
export async function getRssArticles(
  source: RssSource,
  sortName: string,
  sortUrl: string,
  page: number = 1
): Promise<{ articles: RssArticle[]; nextUrl?: string }> {
  // const startTime = Date.now();

  try {
    // 构建URL（支持分页）
    const url = buildUrl(sortUrl, { page: page.toString() });

    // 发起请求
    const headers = parseHeaders(source.header);
    const html = await get(url, {
      ...headers,
      enableCookieJar: source.enabledCookieJar,
      concurrentRate: source.concurrentRate,
      timeout: 30000,
    });

    const contentType = detectContentType(html);

    // 如果没有ruleArticles规则，使用默认RSS解析
    if (!source.ruleArticles) {
      const articles = parseRssDefault(html, sortName, source.sourceUrl);
      return { articles };
    }

    // 使用规则解析
    return await parseRssByRule(source, sortName, url, html, contentType);
  } catch (error) {
    console.error(`获取RSS文章列表失败 [${source.sourceName}]:`, error);
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
  contentType: 'html' | 'json' | 'text'
): Promise<{ articles: RssArticle[]; nextUrl?: string }> {
  // 检查是否需要倒序
  let ruleArticles = source.ruleArticles || '';
  let reverse = false;
  if (ruleArticles.startsWith('-')) {
    reverse = true;
    ruleArticles = ruleArticles.substring(1);
  }

  // 创建规则上下文
  const context: RuleContext = {
    content,
    contentType,
    baseUrl,
    source: source as unknown as Record<string, unknown>,
  };

  // 获取文章列表元素
  const articleElements = await analyzeStringList(ruleArticles, context);

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
  for (let index = 0; index < articleElements.length; index++) {
    const element = articleElements[index];
    const elementContext: RuleContext = {
      content: element,
      contentType: 'html',
      baseUrl,
      source: source as unknown as Record<string, unknown>,
    };

    const article = await parseRssArticle(source, elementContext, baseUrl, sortName, index);
    if (article) {
      articles.push(article);
    }
  }

  // 如果需要倒序
  if (reverse) {
    articles.reverse();
  }

  return { articles, nextUrl };
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

    // 解析图片URL（如果是相对URL，转换为绝对URL）
    let imageUrl: string | undefined;
    if (image) {
      imageUrl = resolveUrl(baseUrl, image);
    }

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
    console.error('解析RSS文章失败:', error);
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
