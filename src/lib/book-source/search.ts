/**
 * 书源搜索功能
 * 对应 legado 项目的 WebBook.searchBook
 */

import { get, post } from '@/lib/http';
import { fetchByAnalyzeUrl } from '@/lib/book-source/analyze-url';
import { analyzeListElements, analyzeRule, analyzeString, parseRule, type RuleContext } from '@/lib/rule-engine';
import type { BookSource, SearchRule } from '@/types';
import type { SearchBook } from '@/types';
import { resolveSearchRequest } from '@/lib/book-source/analyze-search-url';
import { resolveSourceCookiesForHttp } from '@/lib/book-source/source-http';
import { resolveUrl, detectContentType } from '@/lib/book-source/utils';
import { assertLoginCheckPassed } from '@/lib/book-source/login-check';
import { resolveCheckKeyword } from '@/lib/book-source/search-keyword';

function normalizeAuthorText(raw: string): string {
  return raw
    .replace(/^\s*作\s*者[:：\s]+/u, '')
    .replace(/\s+著$/u, '')
    .trim();
}

function normalizeBookNameText(raw: string): string {
  return raw
    .replace(/\s+作\s*者.*$/u, '')
    .replace(/\s+\S+\s+著$/u, '')
    .trim();
}

function stripHtml(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatIntroText(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  return raw
    .replace(/(&nbsp;)+/gi, ' ')
    .replace(/(&ensp;|&emsp;)/gi, ' ')
    .replace(/(&thinsp;|&zwnj;|&zwj;|\u2009|\u200C|\u200D)/g, '')
    .replace(/<\/?(?:div|p|br|hr|h\d|article|dd|dl)[^>]*>/gi, '\n')
    .replace(/<!--[^>]*-->/g, '')
    .replace(/<\/?[a-zA-Z]+(?=[ >])[^<>]*>/g, '')
    .replace(/\s*\n+\s*/g, '\n')
    .replace(/^[\n\s]+/g, '')
    .replace(/[\n\s]+$/g, '')
    .trim();
}

function parseBookListRule(rawRule: string): { listRule: string; reverse: boolean } {
  let listRule = rawRule.trim();
  let reverse = false;
  if (listRule.startsWith('-')) {
    reverse = true;
    listRule = listRule.slice(1).trim();
  } else if (listRule.startsWith('+')) {
    listRule = listRule.slice(1).trim();
  }
  return { listRule, reverse };
}

async function pickFirstValue(
  rules: string[],
  context: RuleContext,
): Promise<string> {
  for (const rule of rules) {
    const value = (await analyzeString(rule, context)).trim();
    if (value) return value;
  }
  return '';
}

async function analyzeFieldWithDebug(
  field: string,
  rule: string | undefined,
  context: RuleContext,
  sourceName: string,
): Promise<string> {
  if (!rule?.trim()) return '';
  const replaced = await analyzeString(rule, context);
  const shouldLogDebug = typeof window !== 'undefined';
  if (shouldLogDebug) {
    let applied = '';
    try {
      const parsed = parseRule(rule);
      if (parsed.ruleBody.trim()) {
        const appliedResults = await analyzeRule(parsed.ruleBody, context);
        applied = appliedResults[0] ?? '';
      }
    } catch (error) {
      applied = `[error:${String(error)}]`;
    }
    const rawPreview = context.content.slice(0, 220).replace(/\s+/g, ' ').trim();
    console.log(
      `[search:field-debug] source=${sourceName} field=${field}\n` +
        `rule=${rule}\n` +
        `raw=${rawPreview}\n` +
        `applied=${applied}\n` +
        `replaced=${replaced}`,
    );
  }
  return replaced;
}

function parseGrayMetaFromTextNodes(raw: string): { author?: string; tags?: string; intro?: string } {
  const lines = raw
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
  if (lines.length === 0) return {};
  const first = lines[0] ?? '';
  const second = lines.slice(1).join('\n').trim();
  const author = first.replace(/\|.*$/u, '').trim();
  const tagMatches = first.match(/#[^#\s,，|｜]+/g) ?? [];
  return {
    author: author || undefined,
    tags: tagMatches.length > 0 ? Array.from(new Set(tagMatches)).join(' ') : undefined,
    intro: second || undefined,
  };
}

export async function normalizeSearchDisplayFields(
  context: RuleContext,
  raw: {
    author: string;
    intro?: string;
    coverUrl?: string;
    kind?: string;
    latestChapterTitle?: string;
  },
): Promise<{
  author: string;
  intro?: string;
  coverUrl?: string;
  kind?: string;
  latestChapterTitle?: string;
}> {
  let author = raw.author;
  let intro = raw.intro;
  let coverUrl = raw.coverUrl;
  let kind = raw.kind;
  let latestChapterTitle = raw.latestChapterTitle;
  const grayTextNodes = await pickFirstValue(
    ['p.gray@textNodes', '//p[@class="gray"]@textNodes', '.gray@textNodes'],
    context,
  );
  const grayMeta = parseGrayMetaFromTextNodes(grayTextNodes);

  if (!coverUrl?.trim()) {
    coverUrl = await pickFirstValue(
      [
        '.cover_m@img@src',
        '.cover_m@img@data-src',
        '.cover_m@img@data-original',
        'img@src',
        'img@data-src',
      ],
      context,
    );
  }

  return {
    author: normalizeAuthorText(stripHtml(author) ?? '') || normalizeAuthorText(grayMeta.author ?? ''),
    intro: formatIntroText(intro ?? undefined) || formatIntroText(grayMeta.intro ?? undefined),
    coverUrl,
    kind: stripHtml(kind ?? undefined) || stripHtml(grayMeta.tags ?? undefined),
    latestChapterTitle: stripHtml(latestChapterTitle ?? undefined),
  };
}

/**
 * 搜索书籍
 */
export async function searchBook(
  source: BookSource,
  keyword: string,
  options?: {
    /** 仅在书源校验流程启用 checkKeyWord 覆盖 */
    useCheckKeyword?: boolean;
  },
): Promise<SearchBook[]> {
  if (!source.ruleSearch || !source.searchUrl) {
    return [];
  }

  const rule = source.ruleSearch;
  const startTime = Date.now();
  const requestKeyword = options?.useCheckKeyword
    ? resolveCheckKeyword(keyword, rule)
    : keyword;

  try {
    if (options?.useCheckKeyword && requestKeyword !== keyword) {
      console.log(`[search] checkKeyWord 覆盖校验关键词 [${source.sourceName}]`, {
        inputKeyword: keyword,
        requestKeyword,
        checkKeyWord: rule.checkKeyWord,
      });
    }

    const resolved = await resolveSearchRequest(source, requestKeyword, 1);
    const { url: searchUrl, method, headers: urlOptionHeaders, body } = resolved;

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(urlOptionHeaders)) {
      const key = k.trim();
      if (!key || key.includes('{{') || key.includes('}}') || key.includes('@')) continue;
      if (String(v).includes('{{') || String(v).includes('}}')) continue;
      headers[key] = String(v);
    }
    const storedCookie = resolveSourceCookiesForHttp(source, searchUrl).trim();
    if (storedCookie) {
      const existing = (headers.Cookie ?? headers.cookie ?? '').trim();
      headers.Cookie = existing ? `${storedCookie}; ${existing}` : storedCookie;
      delete headers.cookie;
    }

    const httpOpts = {
      headers,
      enableCookieJar: source.enabledCookieJar,
      concurrentRate: source.concurrentRate,
      timeout: 30000,
    };

    let html: string;
    if (resolved.useWebView || resolved.webJs) {
      const fetched = await fetchByAnalyzeUrl({
        ruleUrl: resolved.ruleUrlWithOption,
        source,
        keyword: requestKeyword,
        page: 1,
        baseUrl: searchUrl,
        cookies: storedCookie,
        defaultWebViewDelayMs: resolved.webViewDelayMs,
      });
      html = fetched.body;
      await assertLoginCheckPassed(source, html, fetched.url || searchUrl);
    } else {
      html =
        method === 'POST'
          ? await post(searchUrl, body ?? '', httpOpts)
          : await get(searchUrl, httpOpts);
      await assertLoginCheckPassed(source, html, searchUrl);
    }

    const contentType = detectContentType(html);
    const respondTime = Date.now() - startTime;

    const rawBookListRule = rule.bookList?.trim() ?? '';
    const { listRule: parsedBookListRule, reverse: reverseBookList } = parseBookListRule(rawBookListRule);
    if (
      parsedBookListRule.startsWith('$.') &&
      contentType !== 'json'
    ) {
      const preview = html.trim().slice(0, 80);
      console.warn(
        `[search] 搜索响应非 JSON [${source.sourceName}]，无法解析 ${parsedBookListRule}。` +
          (preview.startsWith('<!DOCTYPE') || preview.includes('Just a moment')
            ? ' 可能为验证页/未登录/线路未配置。'
            : ''),
        { url: searchUrl.slice(0, 120), preview },
      );
      return [];
    }

    // 创建规则上下文
    const context: RuleContext = {
      content: html,
      contentType,
      baseUrl: searchUrl,
      source: source as unknown as Record<string, unknown>,
    };

    // 检查是否是详情页（bookUrlPattern匹配）
    if (source.bookUrlPattern) {
      try {
        const pattern = new RegExp(source.bookUrlPattern);
        if (pattern.test(searchUrl)) {
          // 这是详情页，直接解析为单个搜索结果
          const book = await parseBookInfoFromDetail(source, rule, html, searchUrl, context);
          if (book) {
            return [book];
          }
        }
      } catch {
        // 正则表达式无效，忽略
      }
    }

    // 解析书籍列表
    const bookList: SearchBook[] = [];

    if (rule.bookList) {
      // 获取书籍列表元素
      // 如果规则没有提取器（如 "li"），添加 @all 提取器以获取完整HTML元素
      // 这样后续的子规则（如 ".novelname@text"）可以在完整的元素HTML上应用
      let listRule = parsedBookListRule || rawBookListRule;
      if (!listRule.includes('@')) {
        listRule = `${listRule}@all`;
      }

      const listItems = await analyzeListElements(listRule, context);
      if (listItems.length === 0) {
        console.warn(
          `[search] 书源无可解析列表 [${source.sourceName}]`,
          {
            url: searchUrl.slice(0, 120),
            rule: listRule,
            contentType,
            preview: html.trim().slice(0, 80),
          },
        );
        const detailBook = await parseSearchBook(source, rule, context, searchUrl, respondTime);
        if (detailBook) {
          return [detailBook];
        }
      }

      for (const item of listItems) {
        const element = item.content;
        // 保持列表根上下文的内容类型，避免片段重判导致字段串位。
        const elementContext: RuleContext = {
          content: element,
          contentType: context.contentType,
          baseUrl: searchUrl,
          source: source as unknown as Record<string, unknown>,
          regexGroups: item.regexGroups,
          result: typeof item.rawValue === 'string' ? item.rawValue : element,
        };

        const book = await parseSearchBook(source, rule, elementContext, searchUrl, respondTime);
        if (book) {
          bookList.push(book);
        }
      }
    } else {
      // 如果没有bookList规则，尝试直接解析单个书籍
      const book = await parseSearchBook(source, rule, context, searchUrl, respondTime);
      if (book) {
        bookList.push(book);
      }
    }

    if (bookList.length === 0) {
      console.warn(`[search] 书源无搜索结果 [${source.sourceName}]`, {
        url: searchUrl.slice(0, 120),
        contentType,
      });
    }
    if (reverseBookList && bookList.length > 1) {
      bookList.reverse();
    }
    return bookList;
  } catch (error) {
    console.error(`搜索失败 [${source.sourceName}]:`, error);
    return [];
  }
}

/**
 * 从详情页解析书籍信息
 */
async function parseBookInfoFromDetail(
  source: BookSource,
  rule: SearchRule,
  _html: string,
  url: string,
  context: RuleContext
): Promise<SearchBook | null> {
  try {
    const name = await analyzeFieldWithDebug('name', rule.name, context, source.sourceName);
    const author = await analyzeFieldWithDebug('author', rule.author, context, source.sourceName);
    const intro = await analyzeFieldWithDebug('intro', rule.intro, context, source.sourceName);
    let coverUrl = await analyzeFieldWithDebug('coverUrl', rule.coverUrl, context, source.sourceName) || undefined;
    const latestChapterTitle = await analyzeFieldWithDebug(
      'lastChapter',
      rule.lastChapter,
      context,
      source.sourceName,
    ) || undefined;

    const normalizedName = normalizeBookNameText(stripHtml(name) ?? '');
    if (!normalizedName) {
      return null;
    }

    // 解析bookUrl（通常是当前URL或从规则中获取）
    let bookUrl = url;
    if (rule.bookUrl) {
      const parsedBookUrl = await analyzeFieldWithDebug('bookUrl', rule.bookUrl, context, source.sourceName);
      if (parsedBookUrl) {
        bookUrl = resolveUrl(url, parsedBookUrl);
      }
    }

    return {
      bookUrl,
      name,
      author: author || '',
      kind: rule.kind ? await analyzeString(rule.kind, context) : undefined,
      intro,
      coverUrl: coverUrl ? resolveUrl(url, coverUrl) : undefined,
      latestChapterTitle,
      tocUrl: bookUrl, // 详情页通常也是目录页
      origin: source.sourceUrl,
      originName: source.sourceName,
      type: source.sourceType,
      time: Date.now(),
      originOrder: source.customOrder,
      chapterWordCount: -1,
      respondTime: Date.now(),
    };
  } catch (error) {
    console.error('解析详情页失败:', error);
    return null;
  }
}

/**
 * 解析搜索结果中的单个书籍
 */
async function parseSearchBook(
  source: BookSource,
  rule: SearchRule,
  context: RuleContext,
  baseUrl: string,
  respondTime: number
): Promise<SearchBook | null> {
  try {
    const name = await analyzeFieldWithDebug('name', rule.name, context, source.sourceName);
    const normalizedName = normalizeBookNameText(stripHtml(name) ?? '');
    let author = await analyzeFieldWithDebug('author', rule.author, context, source.sourceName);
    let bookUrl = await analyzeFieldWithDebug('bookUrl', rule.bookUrl, context, source.sourceName);

    // 通用兜底：部分 JSON 书源存在 detail_url / book_url，但自定义 bookUrl 规则可能失效
    if (!bookUrl && context.contentType === 'json') {
      try {
        const raw = JSON.parse(context.content) as Record<string, unknown>;
        const fallback =
          (typeof raw.detail_url === 'string' && raw.detail_url.trim()) ||
          (typeof raw.book_url === 'string' && raw.book_url.trim()) ||
          (typeof raw.url === 'string' && raw.url.trim()) ||
          '';
        if (fallback) {
          bookUrl = fallback;
        }
      } catch {
        // ignore JSON fallback parse errors
      }
    }

    if (!normalizedName) {
      return null;
    }
    if (!bookUrl.trim()) {
      bookUrl = baseUrl;
    }

    // 解析其他字段
    let intro = await analyzeFieldWithDebug('intro', rule.intro, context, source.sourceName) || undefined;
    let coverUrl = await analyzeFieldWithDebug('coverUrl', rule.coverUrl, context, source.sourceName) || undefined;
    let latestChapterTitle = await analyzeFieldWithDebug(
      'lastChapter',
      rule.lastChapter,
      context,
      source.sourceName,
    ) || undefined;
    let kind = await analyzeFieldWithDebug('kind', rule.kind, context, source.sourceName) || undefined;
    const wordCount = await analyzeFieldWithDebug('wordCount', rule.wordCount, context, source.sourceName) || undefined;

    const normalized = await normalizeSearchDisplayFields(context, {
      author,
      intro,
      coverUrl,
      kind,
      latestChapterTitle,
    });
    author = normalized.author;
    intro = normalized.intro;
    coverUrl = normalized.coverUrl;
    kind = normalized.kind;
    latestChapterTitle = normalized.latestChapterTitle;

    // 解析tocUrl（目录页URL）
    // 注意：SearchRule中没有tocUrl字段，通常bookUrl就是tocUrl
    // 如果需要单独的tocUrl，应该从BookInfoRule中获取
    const tocUrl = resolveUrl(baseUrl, bookUrl);

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
      name: normalizedName,
      author: author || '',
      kind,
      wordCount: wordCount?.trim() || undefined,
      intro,
      coverUrl: coverUrl ? resolveUrl(baseUrl, coverUrl) : undefined,
      latestChapterTitle,
      tocUrl,
      origin: source.sourceUrl,
      originName: source.sourceName,
      type: source.sourceType,
      time: Date.now(),
      originOrder: source.customOrder,
      chapterWordCount,
      chapterWordCountText,
      respondTime,
    };
  } catch (error) {
    console.error('解析搜索结果失败:', error);
    return null;
  }
}
