/**
 * 书源搜索功能
 * 对应 legado 项目的 WebBook.searchBook
 */

import { get, post } from '@/lib/http';
import { analyzeString, analyzeStringList, type RuleContext } from '@/lib/rule-engine';
import type { BookSource, SearchRule } from '@/types';
import type { SearchBook } from '@/types';
import { resolveSearchRequest } from '@/lib/book-source/analyze-search-url';
import { resolveSourceCookiesForHttp } from '@/lib/book-source/source-http';
import { resolveUrl, detectContentType } from '@/lib/book-source/utils';

/**
 * 搜索书籍
 */
export async function searchBook(
  source: BookSource,
  keyword: string
): Promise<SearchBook[]> {
  if (!source.ruleSearch || !source.searchUrl) {
    return [];
  }

  const rule = source.ruleSearch;
  const startTime = Date.now();

  try {
    const { url: searchUrl, method, headers: urlOptionHeaders, body } = await resolveSearchRequest(
      source,
      keyword,
      1,
    );

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

    const html =
      method === 'POST'
        ? await post(searchUrl, body ?? '', httpOpts)
        : await get(searchUrl, httpOpts);

    const contentType = detectContentType(html);
    const respondTime = Date.now() - startTime;

    const bookListRule = rule.bookList?.trim() ?? '';
    if (
      bookListRule.startsWith('$.') &&
      contentType !== 'json'
    ) {
      const preview = html.trim().slice(0, 80);
      console.warn(
        `[search] 搜索响应非 JSON [${source.sourceName}]，无法解析 ${bookListRule}。` +
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
      let listRule = normalizeBookListRule(bookListRule || rule.bookList);
      if (!listRule.includes('@')) {
        listRule = `${listRule}@all`;
      }

      const bookElements = await analyzeStringList(listRule, context);
      if (bookElements.length === 0) {
        console.warn(
          `[search] 书源无可解析列表 [${source.sourceName}]`,
          {
            url: searchUrl.slice(0, 120),
            rule: listRule,
            contentType,
            preview: html.trim().slice(0, 80),
          },
        );
      }

      for (const element of bookElements) {
        // 如果 bookList 规则是通用的（如 "li"），且 name/bookUrl 规则需要特定类（如 ".novelname"），
        // 则先检查元素是否包含该类的特征，提前过滤无效元素
        if (rule.name && rule.name.includes('.novelname') && !element.includes('novelname')) {
          // 跳过不包含 novelname 的元素（如导航栏、登录链接等）
          continue;
        }
        
        // 为每个元素创建新的上下文（保持原始内容类型，JSON 元素不应被当作 HTML）
        const elementContext: RuleContext = {
          content: element,
          contentType: detectContentType(element),
          baseUrl: searchUrl,
          source: source as unknown as Record<string, unknown>,
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
    return bookList;
  } catch (error) {
    console.error(`搜索失败 [${source.sourceName}]:`, error);
    return [];
  }
}

/**
 * Legado 中 bookList 常写成「选择器 + <js>后处理」。
 * 提取列表元素阶段只需要前半段选择器，否则会把 <js> 一并当成 CSS 导致空列表。
 */
function normalizeBookListRule(rule: string): string {
  const trimmed = rule.trim();
  if (!trimmed) return trimmed;
  const jsIdx = trimmed.search(/\n\s*<js>|<js>|@js:/i);
  if (jsIdx <= 0) return trimmed;
  return trimmed.slice(0, jsIdx).trim();
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
    const name = rule.name ? await analyzeString(rule.name, context) : '';
    const author = rule.author ? await analyzeString(rule.author, context) : '';
    const intro = rule.intro ? await analyzeString(rule.intro, context) : '';
    const coverUrl = rule.coverUrl ? await analyzeString(rule.coverUrl, context) : undefined;
    const latestChapterTitle = rule.lastChapter
      ? await analyzeString(rule.lastChapter, context)
      : undefined;

    if (!name) {
      return null;
    }

    // 解析bookUrl（通常是当前URL或从规则中获取）
    let bookUrl = url;
    if (rule.bookUrl) {
      const parsedBookUrl = await analyzeString(rule.bookUrl, context);
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
    const name = rule.name ? await analyzeString(rule.name, context) : '';
    const author = rule.author ? await analyzeString(rule.author, context) : '';
    let bookUrl = rule.bookUrl ? await analyzeString(rule.bookUrl, context) : '';

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

    if (!name || !bookUrl) {
      return null;
    }

    // 解析其他字段
    const intro = rule.intro ? await analyzeString(rule.intro, context) : undefined;
    const coverUrl = rule.coverUrl ? await analyzeString(rule.coverUrl, context) : undefined;
    const latestChapterTitle = rule.lastChapter
      ? await analyzeString(rule.lastChapter, context)
      : undefined;
    const kind = rule.kind ? await analyzeString(rule.kind, context) : undefined;
    const wordCount = rule.wordCount ? await analyzeString(rule.wordCount, context) : undefined;

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
      name,
      author: author || '',
      kind,
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
