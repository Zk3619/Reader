/**
 * 书源发现功能
 * 对应 legado 项目的 WebBook.exploreBook
 */

import { get, post } from '@/lib/http';
import { analyzeString, analyzeStringList, type RuleContext } from '@/lib/rule-engine';
import { parseAjaxArgs } from '@/lib/js-engine/legado/host/parse-ajax';
import { getStoredSourceCookiesForUrl } from '@/lib/js-engine';
import type { BookSource, ExploreRule } from '@/types';
import type { SearchBook } from '@/types';
import { isLegadoAjaxBookListExploreUrl } from '@/lib/book-source/explore-legado-ajax';
import { tryFormatDisplayUpdateTime } from '@/lib/format/display-time';
import { buildUrl, parseHeaders, resolveUrl, detectContentType } from '@/lib/book-source/utils';
import {
  EXPLORE_INTRO_JSON_PATHS,
  EXPLORE_LAST_CHAPTER_JSON_PATHS,
  EXPLORE_UPDATE_TIME_JSON_PATHS,
  pickFirstJsonField,
} from '@/lib/book-source/explore-json-fields';

function enrichJsonBookContext(
  element: string,
  contentType: 'html' | 'json' | 'text',
  baseUrl: string,
  source: BookSource,
  debugIndex?: number
): RuleContext {
  const ctx: RuleContext = {
    content: element,
    contentType,
    baseUrl,
    source: source as unknown as Record<string, unknown>,
    result: element,
    ...(debugIndex !== undefined ? { _debugIndex: debugIndex } : {}),
  };
  if (contentType === 'json') {
    try {
      ctx.book = JSON.parse(element) as Record<string, unknown>;
    } catch {
      /* 单条书籍 JSON 解析失败时仍用字符串 content */
    }
  }
  return ctx as RuleContext;
}

/** 拆分书源 lastChapter 模板中的「章节 • 时间」 */
function splitLastChapterField(raw: string): { title?: string; embeddedTime?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const sep = trimmed.search(/\s*[•·]\s*/);
  if (sep < 0) return { title: trimmed };
  const title = trimmed.slice(0, sep).trim();
  const embeddedTime = trimmed.slice(sep).replace(/^\s*[•·]\s*/, '').trim();
  return {
    title: title || undefined,
    embeddedTime: embeddedTime || undefined,
  };
}

async function pickJsonUpdateTime(context: RuleContext): Promise<string | undefined> {
  return pickFirstJsonField(context, EXPLORE_UPDATE_TIME_JSON_PATHS);
}

/**
 * 发现书籍（浏览推荐书籍）
 * @param source 书源
 * @param page 页码（从 1 开始）
 * @param exploreUrlOverride 可选：发现页子分类 URL（如点击排行榜/标签后的 URL），支持 {{page}} 分页
 */
function mergeCookieHeader(stored: string, headerCookie: string | undefined): string {
  const a = (stored ?? '').trim();
  const b = (headerCookie ?? '').trim();
  if (!a) return b;
  if (!b) return a;
  return `${a}; ${b}`;
}

/** Legado ajax 书单列（如晴天 `/get_book_shelf,{...}`） */
async function exploreBookViaLegadoAjax(
  source: BookSource,
  page: number,
  rawUrl: string
): Promise<SearchBook[]> {
  const ajax = parseAjaxArgs(rawUrl.trim());
  if (!ajax || !source.ruleExplore) return [];

  const origin = source.sourceUrl?.trim() ?? '';
  const resolved = origin ? resolveUrl(origin, ajax.urlStr) : ajax.urlStr;
  const stored = getStoredSourceCookiesForUrl(source, resolved);
  const cookieHeader = mergeCookieHeader(
    stored,
    ajax.headers.Cookie ?? ajax.headers.cookie
  );
  const headers: Record<string, string> = {
    ...parseHeaders(source.header),
    ...ajax.headers,
    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
  };

  const pageStr = page.toString();
  const requestUrl = buildUrl(resolved, { page: pageStr });
  const body =
    ajax.body != null
      ? buildUrl(
        typeof ajax.body === 'string' ? ajax.body : JSON.stringify(ajax.body),
        { page: pageStr }
      )
      : undefined;

  console.log('[explore] Legado ajax 书单列:', ajax.method, requestUrl.substring(0, 120));

  const startTime = Date.now();
  try {
    const html =
      ajax.method === 'POST'
        ? await post(requestUrl, body ?? '', {
          headers,
          enableCookieJar: source.enabledCookieJar,
          concurrentRate: source.concurrentRate,
          timeout: 30000,
        })
        : await get(requestUrl, {
          headers,
          enableCookieJar: source.enabledCookieJar,
          concurrentRate: source.concurrentRate,
          timeout: 30000,
        });

    const respondTime = Date.now() - startTime;
    return parseExploreBooksFromContent(source, html, requestUrl, respondTime);
  } catch (error) {
    console.error(`[explore] Legado ajax 书单列失败 [${source.sourceName}]:`, error);
    return [];
  }
}

async function parseExploreBooksFromContent(
  source: BookSource,
  html: string,
  exploreUrl: string,
  respondTime: number
): Promise<SearchBook[]> {
  const rule = source.ruleExplore;
  if (!rule) return [];

  const contentType = detectContentType(html);
  const context: RuleContext = {
    content: html,
    contentType,
    baseUrl: exploreUrl,
    source: source as unknown as Record<string, unknown>,
  };

  const bookList: SearchBook[] = [];

  if (rule.bookList) {
    let bookListRule = rule.bookList;
    if (!bookListRule.includes('@')) {
      bookListRule = `${bookListRule}@all`;
    }
    const bookElements = await analyzeStringList(bookListRule, context);
    for (let i = 0; i < bookElements.length; i++) {
      const element = bookElements[i];
      const elementContext = enrichJsonBookContext(
        element,
        contentType,
        exploreUrl,
        source,
        i
      );
      const book = await parseExploreBook(source, rule, elementContext, exploreUrl, respondTime);
      if (book) bookList.push(book);
    }
  } else {
    const book = await parseExploreBook(source, rule, context, exploreUrl, respondTime);
    if (book) bookList.push(book);
  }

  return bookList;
}

export async function exploreBook(
  source: BookSource,
  page: number = 1,
  exploreUrlOverride?: string
): Promise<SearchBook[]> {
  let baseUrl = exploreUrlOverride ?? source.exploreUrl;
  if (!source.ruleExplore || !baseUrl) {
    console.warn('[explore] 缺少必要参数:', { hasRuleExplore: !!source.ruleExplore, baseUrl });
    return [];
  }

  if (exploreUrlOverride && isLegadoAjaxBookListExploreUrl(exploreUrlOverride)) {
    return exploreBookViaLegadoAjax(source, page, exploreUrlOverride);
  }

  console.log('[explore] 初始 baseUrl:', baseUrl.substring(0, 200));

  // 如果是相对路径（如 /category/xuanhuan/{{page}}.html），根据 bookSourceUrl 解析为绝对 URL
  if (baseUrl.startsWith('/') && source.sourceUrl) {
    try {
      const origin = new URL(source.sourceUrl).origin;
      baseUrl = origin + baseUrl;
      console.log('[explore] 相对路径解析为绝对 URL:', baseUrl.substring(0, 200));
    } catch (e) {
      console.warn('[explore] 解析相对路径失败:', e);
      // 解析失败则保持原值
    }
  }

  const startTime = Date.now();

  try {
    // 构建发现 URL（支持 {{page}} 分页）
    const exploreUrl = buildUrl(baseUrl, { page: page.toString() });
    console.log('[explore] 构建后的 URL:', exploreUrl.substring(0, 200), '页码:', page);

    // 发起请求
    const headers = parseHeaders(source.header);
    const html = await get(exploreUrl, {
      headers,
      enableCookieJar: source.enabledCookieJar,
      concurrentRate: source.concurrentRate,
      timeout: 30000,
    });

    console.log('[explore] 响应长度:', html.length, '前200字符:', html.substring(0, 200));

    const respondTime = Date.now() - startTime;
    const bookList = await parseExploreBooksFromContent(source, html, exploreUrl, respondTime);
    console.log('[explore] 最终解析到书籍数:', bookList.length);
    return bookList;
  } catch (error) {
    console.error(`发现书籍失败 [${source.sourceName}]:`, error);
    return [];
  }
}

/**
 * 解析发现结果中的单个书籍
 */
async function parseExploreBook(
  source: BookSource,
  rule: ExploreRule,
  context: RuleContext,
  baseUrl: string,
  respondTime: number
): Promise<SearchBook | null> {
  try {
    const name = rule.name ? await analyzeString(rule.name, context) : '';
    const author = rule.author ? await analyzeString(rule.author, context) : '';
    const bookUrl = rule.bookUrl ? await analyzeString(rule.bookUrl, context) : '';

    // 调试日志（仅前3个）
    const debugIndex = (context as unknown as { _debugIndex?: number })._debugIndex;
    const isDebug = debugIndex !== undefined && debugIndex < 3;

    if (isDebug) {
      // 检查元素中是否包含 .novelname
      const hasNovelnameClass =
        context.content.includes('class="novelname') ||
        context.content.includes("class='novelname") ||
        (context.content.includes('class="') && context.content.includes('novelname'));

      console.log('[explore] parseExploreBook 解析结果:', {
        name: name || '(空)',
        author: author || '(空)',
        bookUrl: bookUrl || '(空)',
        bookUrlRule: rule.bookUrl,
        nameRule: rule.name,
        authorRule: rule.author,
        elementPreview: context.content.substring(0, 500),
        hasNovelnameClass,
        elementLength: context.content.length,
      });
    }

    if (!name || !bookUrl) {
      if (isDebug) {
        console.warn('[explore] parseExploreBook 缺少必要字段:', { name: !!name, bookUrl: !!bookUrl });
      }
      return null;
    }

    // 解析其他字段
    let intro = rule.intro ? await analyzeString(rule.intro, context) : undefined;
    if (!intro?.trim()) {
      intro = await pickFirstJsonField(context, EXPLORE_INTRO_JSON_PATHS);
    }

    const coverUrl = rule.coverUrl ? await analyzeString(rule.coverUrl, context) : undefined;
    let latestChapterTitle = rule.lastChapter
      ? await analyzeString(rule.lastChapter, context)
      : undefined;
    let updateTimeRaw = rule.updateTime
      ? await analyzeString(rule.updateTime, context)
      : undefined;

    if (latestChapterTitle) {
      const split = splitLastChapterField(latestChapterTitle);
      latestChapterTitle = split.title;
      if (!updateTimeRaw && split.embeddedTime) {
        updateTimeRaw = split.embeddedTime;
      }
    }

    if (!latestChapterTitle?.trim()) {
      latestChapterTitle = await pickFirstJsonField(context, EXPLORE_LAST_CHAPTER_JSON_PATHS);
    }

    if (!updateTimeRaw?.trim()) {
      updateTimeRaw = await pickJsonUpdateTime(context);
    }

    const latestChapterUpdateTime = tryFormatDisplayUpdateTime(updateTimeRaw) || undefined;
    const kind = rule.kind ? await analyzeString(rule.kind, context) : undefined;
    const wordCount = rule.wordCount ? await analyzeString(rule.wordCount, context) : undefined;

    // 解析徽章字段：优先使用规则配置，若规则未配置但内容为 JSON，则尝试自动提取
    const sourceStr = rule.source
      ? await analyzeString(rule.source, context)
      : context.contentType === 'json'
        ? await analyzeString('$.source', context)
        : undefined;
    const status = rule.status
      ? await analyzeString(rule.status, context)
      : context.contentType === 'json'
        ? await analyzeString('$.status', context)
        : undefined;
    const tab = rule.tab
      ? await analyzeString(rule.tab, context)
      : context.contentType === 'json'
        ? await analyzeString('$.tab', context)
        : undefined;
    const category = rule.category
      ? await analyzeString(rule.category, context)
      : context.contentType === 'json'
        ? await analyzeString('$.category', context)
        : undefined;
    const tags = rule.tags
      ? await analyzeString(rule.tags, context)
      : context.contentType === 'json'
        ? await analyzeString('$.tags', context)
        : undefined;
    const score = rule.score
      ? await analyzeString(rule.score, context)
      : context.contentType === 'json'
        ? await analyzeString('$.score', context)
        : undefined;

    // 解析tocUrl（目录页URL）
    let tocUrl = resolveUrl(baseUrl, bookUrl);
    // 注意：ExploreRule没有tocUrl字段，通常bookUrl就是tocUrl

    // 解析章节字数
    let chapterWordCount = -1;
    let chapterWordCountText: string | undefined;
    if (wordCount) {
      chapterWordCountText = wordCount;
      // 尝试提取数字
      const match = wordCount.match(/(\d+(?:\.\d+)?)\s*(?:万|w|k|千)?/i);
      if (match) {
        let num = parseFloat(match[1]);
        if (/万|w/i.test(wordCount)) {
          num *= 10000;
        } else if (/k|千/i.test(wordCount)) {
          num *= 1000;
        }
        chapterWordCount = Math.floor(num);
      }
    }

    return {
      bookUrl: resolveUrl(baseUrl, bookUrl),
      name,
      author: author || '',
      kind,
      intro,
      coverUrl: coverUrl ? resolveUrl(baseUrl, coverUrl) : undefined,
      latestChapterTitle,
      latestChapterUpdateTime,
      tocUrl,
      origin: source.sourceUrl,
      originName: source.sourceName,
      type: source.sourceType,
      time: Date.now(),
      originOrder: source.customOrder,
      chapterWordCount,
      chapterWordCountText,
      respondTime,
      source: sourceStr,
      status,
      tab,
      category,
      tags,
      score,
    };
  } catch (error) {
    console.error('解析发现结果失败:', error);
    return null;
  }
}
