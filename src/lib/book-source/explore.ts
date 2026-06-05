/**
 * 书源发现功能
 * 对应 legado 项目的 WebBook.exploreBook
 */

import { isAbortError } from '@/lib/http';
import { getBookSourcePage, postBookSourcePage } from '@/lib/book-source/source-http-cf';
import { analyzeListElements, analyzeString, type RuleContext } from '@/lib/rule-engine';
import { isRuleExpression } from '@/lib/rule-engine/rule-expression';
import { legadoListRuleNeedsAllSuffix, isAtomicLegadoScriptRule } from '@/lib/rule-engine/legado-source-rule';
import { parseAjaxArgs } from '@/lib/js-engine/legado/host/parse-ajax';
import { getStoredSourceCookiesForUrl } from '@/lib/js-engine';
import type { BookSource, ExploreRule, SearchRule } from '@/types';
import type { SearchBook } from '@/types';
import { isLegadoAjaxBookListExploreUrl } from '@/lib/book-source/explore-legado-ajax';
import { tryFormatDisplayUpdateTime } from '@/lib/format/display-time';
import { buildUrl, parseHeaders, resolveUrl, detectContentType, resolveMediaUrl } from '@/lib/book-source/utils';
import { resolveBookType } from '@/lib/book-source/book-type';
import {
  COVER_JSON_PATHS,
  EXPLORE_AUTHOR_JSON_PATHS,
  EXPLORE_INTRO_JSON_PATHS,
  EXPLORE_LAST_CHAPTER_JSON_PATHS,
  EXPLORE_UPDATE_TIME_JSON_PATHS,
  pickFirstJsonField,
} from '@/lib/book-source/explore-json-fields';
import { assertLoginCheckPassed } from '@/lib/book-source/login-check';
import {
  formatWordCountLikeLegado,
  normalizeAuthorText,
} from '@/lib/book-source/search-format';
import { enrichJsonListItemContext } from '@/lib/book-source/json-list-context';
import {
  createScriptNoticeBus,
  isScriptNoticeBlockedError,
} from '@/lib/book-source/rate-limit-guard';

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

export type ExploreBookOptions = {
  signal?: AbortSignal;
};

function exploreRuleHasParseFields(rule: ExploreRule | SearchRule | undefined): boolean {
  if (!rule) return false;
  return Boolean(
    rule.bookList?.trim() || rule.name?.trim() || rule.bookUrl?.trim(),
  );
}

/**
 * 对齐 Legado：许多书源 ruleExplore 为空，列表字段写在 ruleSearch（如第一版主 banzhu）。
 */
function stripHtmlFragment(raw: string | undefined): string {
  if (!raw) return '';
  return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function exploreAuthorLooksInvalid(author: string): boolean {
  const t = author.trim();
  if (!t) return true;
  if (isRuleExpression(t)) return true;
  if (/<[a-z!/]/i.test(t)) return true;
  if (/\$1|class\s*=/i.test(t)) return true;
  if (t.length > 64) return true;
  return false;
}

async function fallbackExploreName(
  rawName: string,
  nameRule: string | undefined,
  context: RuleContext,
): Promise<string> {
  if (rawName.trim()) return rawName;
  const rule = nameRule?.trim() ?? '';
  if (rule !== '@text' && rule !== 'title' && rule !== '@title') return rawName;
  for (const r of ['@title', 'title', 'a@title', 'a@text', 'a@ownText']) {
    const v = (await analyzeString(r, context)).trim();
    if (v) return v;
  }
  return rawName;
}

async function fallbackExploreBookUrl(
  rawUrl: string,
  bookUrlRule: string | undefined,
  context: RuleContext,
): Promise<string> {
  if (rawUrl.trim()) return rawUrl;
  const rule = bookUrlRule?.trim() ?? '';
  if (rule !== '@href' && rule !== 'href') return rawUrl;

  for (const r of ['@href', 'href', 'a@href', '@data-href', '@data-url', 'a@data-href', 'a@data-url']) {
    const v = (await analyzeString(r, context, { isUrl: true })).trim();
    if (v) return v;
  }

  const m = context.content.match(/\shref\s*=\s*["']([^"']+)["']/i);
  if (m?.[1]?.trim()) return m[1].trim();
  return rawUrl;
}

/** ##作者…## 等纯替换规则失败时，回退常见 author 选择器 */
export async function resolveExploreAuthor(
  rule: string | undefined,
  context: RuleContext,
): Promise<string> {
  if (!rule?.trim()) return '';
  let author = stripHtmlFragment(await analyzeString(rule, context));
  author = normalizeAuthorText(author);
  if (exploreAuthorLooksInvalid(author)) {
    for (const fallback of ['a.author@text', '.author@text', 'a.author@textNodes']) {
      const hit = normalizeAuthorText(
        stripHtmlFragment(await analyzeString(fallback, context)),
      );
      if (hit && !exploreAuthorLooksInvalid(hit)) {
        author = hit;
        break;
      }
    }
  }
  if (exploreAuthorLooksInvalid(author) && context.contentType === 'json') {
    const hit = await pickFirstJsonField(context, EXPLORE_AUTHOR_JSON_PATHS);
    if (hit) {
      author = normalizeAuthorText(stripHtmlFragment(hit));
    }
  }
  return exploreAuthorLooksInvalid(author) ? '' : author;
}

export function resolveExploreParseRule(source: BookSource): ExploreRule | undefined {
  const explore = source.ruleExplore;
  if (exploreRuleHasParseFields(explore)) return explore;
  const search = source.ruleSearch;
  if (exploreRuleHasParseFields(search)) return search;
  return undefined;
}

/** Legado ajax 书单列（如晴天 `/get_book_shelf,{...}`） */
async function exploreBookViaLegadoAjax(
  source: BookSource,
  page: number,
  rawUrl: string,
  signal?: AbortSignal,
): Promise<SearchBook[]> {
  const noticeBus = createScriptNoticeBus(source.sourceName, '发现');
  const ajax = parseAjaxArgs(rawUrl.trim());
  if (!ajax || !resolveExploreParseRule(source)) return [];

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
    const httpOpts = {
      headers,
      enableCookieJar: source.enabledCookieJar,
      concurrentRate: source.concurrentRate,
      timeout: 30000,
      signal,
    };
    const html =
      ajax.method === 'POST'
        ? await postBookSourcePage(source, requestUrl, body ?? '', httpOpts)
        : await getBookSourcePage(source, requestUrl, httpOpts);
    await assertLoginCheckPassed(source, html, requestUrl);

    const respondTime = Date.now() - startTime;
    return parseExploreBooksFromContent(
      source,
      html,
      requestUrl,
      respondTime,
      noticeBus.onScriptToast,
    );
  } catch (error) {
    if (isAbortError(error)) throw error;
    console.error(`[explore] Legado ajax 书单列失败 [${source.sourceName}]:`, error);
    return [];
  }
}

async function parseExploreBooksFromContent(
  source: BookSource,
  html: string,
  exploreUrl: string,
  respondTime: number,
  onScriptToast?: (msg?: unknown, level?: unknown) => void,
): Promise<SearchBook[]> {
  const primaryRule = resolveExploreParseRule(source);
  if (!primaryRule) return [];

  const contentType = detectContentType(html);
  const context: RuleContext = {
    content: html,
    contentType,
    baseUrl: exploreUrl,
    source: source as unknown as Record<string, unknown>,
    onScriptToast,
  };

  const bookList: SearchBook[] = [];
  const parseWithRule = async (rule: ExploreRule | SearchRule): Promise<SearchBook[]> => {
    const parsed: SearchBook[] = [];
    if (rule.bookList) {
      let bookListRule = rule.bookList;
      if (legadoListRuleNeedsAllSuffix(bookListRule)) {
        bookListRule = `${bookListRule}@all`;
      }
      const listItems = await analyzeListElements(bookListRule, context);
      for (let i = 0; i < listItems.length; i++) {
        const element = listItems[i].content;
        const elementContext = enrichJsonListItemContext(
          element,
          contentType,
          exploreUrl,
          source as unknown as Record<string, unknown>,
          { debugIndex: i, regexGroups: listItems[i].regexGroups },
        );
        elementContext.onScriptToast = onScriptToast;
        const book = await parseExploreBook(source, rule as ExploreRule, elementContext, exploreUrl, respondTime);
        if (book) parsed.push(book);
      }
    } else {
      const book = await parseExploreBook(source, rule as ExploreRule, context, exploreUrl, respondTime);
      if (book) parsed.push(book);
    }
    return parsed;
  };

  bookList.push(...await parseWithRule(primaryRule));
  return bookList;
}

export async function exploreBook(
  source: BookSource,
  page: number = 1,
  exploreUrlOverride?: string,
  options?: ExploreBookOptions,
): Promise<SearchBook[]> {
  const noticeBus = createScriptNoticeBus(source.sourceName, '发现');
  const signal = options?.signal;
  let baseUrl = exploreUrlOverride ?? source.exploreUrl;
  const parseRule = resolveExploreParseRule(source);
  if (!parseRule || !baseUrl) {
    console.warn('[explore] 缺少必要参数:', {
      hasParseRule: !!parseRule,
      hasRuleExplore: exploreRuleHasParseFields(source.ruleExplore),
      hasRuleSearch: exploreRuleHasParseFields(source.ruleSearch),
      baseUrl,
    });
    return [];
  }

  if (exploreUrlOverride && isLegadoAjaxBookListExploreUrl(exploreUrlOverride)) {
    return exploreBookViaLegadoAjax(source, page, exploreUrlOverride, signal);
  }

  console.log('[explore] 初始 baseUrl:', baseUrl.substring(0, 200));

  const { alignUrlToBookSourceRequestOrigin, resolveBookSourceRequestOrigin } =
    await import('@/lib/book-source/source-http');

  // 相对路径：优先 CF 活跃镜像域（过挑战后 panel 跳转域），否则书源 sourceUrl
  if (baseUrl.startsWith('/')) {
    const origin = resolveBookSourceRequestOrigin(source);
    if (origin) {
      baseUrl = origin + baseUrl;
      console.log('[explore] 相对路径解析为绝对 URL:', baseUrl.substring(0, 200));
    } else if (source.sourceUrl) {
      try {
        baseUrl = new URL(source.sourceUrl).origin + baseUrl;
        console.log('[explore] 相对路径解析为绝对 URL:', baseUrl.substring(0, 200));
      } catch (e) {
        console.warn('[explore] 解析相对路径失败:', e);
      }
    }
  }

  const startTime = Date.now();

  try {
    // 构建发现 URL（支持 {{page}} 分页；@js:/<js> 规则勿走 URL 解析以免被 encode）
    const exploreUrl = isAtomicLegadoScriptRule(baseUrl)
      ? buildUrl(baseUrl, { page: page.toString() })
      : alignUrlToBookSourceRequestOrigin(
          buildUrl(baseUrl, { page: page.toString() }),
          source,
        );
    console.log('[explore] 构建后的 URL:', exploreUrl.substring(0, 200), '页码:', page);

    // 发起请求
    const { fetchSourcePage } = await import('@/lib/book-source/fetch-source-page');
    let html: string;
    try {
      const fetched = await fetchSourcePage({
        ruleUrl: exploreUrl,
        source,
        page,
        baseUrl: resolveBookSourceRequestOrigin(source) || source.sourceUrl,
        scriptNotice: noticeBus,
      });
      html = fetched.body;
    } catch (e) {
      if (isScriptNoticeBlockedError(e)) {
        console.warn('[explore] 命中频率限制提示，停止本次解析', {
          url: exploreUrl.slice(0, 120),
          throttleMessage: e.notice.message,
        });
        return [];
      }
      throw e;
    }

    console.log('[explore] 响应长度:', html.length, '前200字符:', html.substring(0, 200));

    const respondTime = Date.now() - startTime;
    const bookList = await parseExploreBooksFromContent(
      source,
      html,
      exploreUrl,
      respondTime,
      noticeBus.onScriptToast,
    );
    console.log('[explore] 最终解析到书籍数:', bookList.length);
    return bookList;
  } catch (error) {
    if (isAbortError(error)) throw error;
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
    let name = rule.name ? await analyzeString(rule.name, context) : '';
    const author = rule.author ? await resolveExploreAuthor(rule.author, context) : '';
    let bookUrl = rule.bookUrl ? await analyzeString(rule.bookUrl, context) : '';
    name = await fallbackExploreName(name, rule.name, context);
    bookUrl = await fallbackExploreBookUrl(bookUrl, rule.bookUrl, context);

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

    let coverUrl = rule.coverUrl
      ? await analyzeString(rule.coverUrl, context, { isUrl: true })
      : undefined;
    if (!coverUrl?.trim() && context.contentType === 'json') {
      coverUrl = await pickFirstJsonField(context, COVER_JSON_PATHS);
    }
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
    const wordCountRaw = rule.wordCount
      ? stripHtmlFragment(await analyzeString(rule.wordCount, context))
      : undefined;
    const wordCount = formatWordCountLikeLegado(wordCountRaw);

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
    if (wordCountRaw) {
      chapterWordCountText = wordCount ?? wordCountRaw;
      // 尝试提取数字
      const match = wordCountRaw.match(/(\d+(?:\.\d+)?)\s*(?:万|w|k|千)?/i);
      if (match) {
        let num = parseFloat(match[1]);
        if (/万|w/i.test(wordCountRaw)) {
          num *= 10000;
        } else if (/k|千/i.test(wordCountRaw)) {
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
      wordCount: wordCount?.trim() || undefined,
      intro,
      coverUrl: resolveMediaUrl(baseUrl, coverUrl),
      latestChapterTitle,
      latestChapterUpdateTime,
      tocUrl,
      origin: source.sourceUrl,
      originName: source.sourceName,
      type: resolveBookType(source.sourceType, tab),
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
