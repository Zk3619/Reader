/**
 * 书源搜索功能
 * 对应 legado 项目的 WebBook.searchBook
 */

import { get } from '@/lib/http';
import { analyzeString, analyzeStringList, type RuleContext } from '@/lib/rule-engine';
import type { BookSource, SearchRule } from '@/types';
import type { SearchBook } from '@/types';
import { buildUrl, parseHeaders, resolveUrl, detectContentType } from '@/lib/book-source/utils';

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
    // 构建搜索URL
    const searchUrl = buildUrl(source.searchUrl, { key: keyword });
    
    // 发起请求
    const headers = parseHeaders(source.header);
    const html = await get(searchUrl, {
      ...headers,
      enableCookieJar: source.enabledCookieJar,
      concurrentRate: source.concurrentRate,
      timeout: 30000,
    });

    const contentType = detectContentType(html);
    const respondTime = Date.now() - startTime;

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
      let bookListRule = rule.bookList;
      if (!bookListRule.includes('@')) {
        bookListRule = `${bookListRule}@all`;
      }
      
      const bookElements = await analyzeStringList(bookListRule, context);

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
    const bookUrl = rule.bookUrl ? await analyzeString(rule.bookUrl, context) : '';

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
