/**
 * 书源发现功能
 * 对应 legado 项目的 WebBook.exploreBook
 */

import { get } from '@/lib/http';
import { analyzeString, analyzeStringList, type RuleContext } from '@/lib/rule-engine';
import type { BookSource, ExploreRule } from '@/types';
import type { SearchBook } from '@/types';
import { buildUrl, parseHeaders, resolveUrl, detectContentType } from './utils';

/**
 * 发现书籍（浏览推荐书籍）
 * @param source 书源
 * @param page 页码（从 1 开始）
 * @param exploreUrlOverride 可选：发现页子分类 URL（如点击排行榜/标签后的 URL），支持 {{page}} 分页
 */
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

  const rule = source.ruleExplore;
  const startTime = Date.now();

  try {
    // 构建发现 URL（支持 {{page}} 分页）
    const exploreUrl = buildUrl(baseUrl, { page: page.toString() });
    console.log('[explore] 构建后的 URL:', exploreUrl.substring(0, 200), '页码:', page);
    
    // 发起请求
    const headers = parseHeaders(source.header);
    const html = await get(exploreUrl, {
      ...headers,
      enableCookieJar: source.enabledCookieJar,
      concurrentRate: source.concurrentRate,
      timeout: 30000,
    });

    console.log('[explore] 响应长度:', html.length, '前200字符:', html.substring(0, 200));

    const contentType = detectContentType(html);
    const respondTime = Date.now() - startTime;

    // 创建规则上下文
    const context: RuleContext = {
      content: html,
      contentType,
      baseUrl: exploreUrl,
      source: source as unknown as Record<string, unknown>,
    };

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
      
      console.log('[explore] 使用 bookList 规则:', rule.bookList, '-> 处理后:', bookListRule);
      const bookElements = await analyzeStringList(bookListRule, context);
      console.log('[explore] 提取到书籍元素数:', bookElements.length);
      
      if (bookElements.length > 0) {
        console.log('[explore] 第一个元素预览:', bookElements[0].substring(0, 500));
      }

      // 先不过滤，尝试解析所有元素，看看哪些能成功
      // 同时记录包含 novelname 的元素索引，用于分析
      const novelnameIndices: number[] = [];
      
      for (let i = 0; i < bookElements.length; i++) {
        const element = bookElements[i];
        
        // 检查是否包含 novelname（用于分析）
        if (element.includes('novelname')) {
          novelnameIndices.push(i);
          if (novelnameIndices.length <= 3) {
            console.log(`[explore] 找到包含novelname的元素[${i}]:`, element.substring(0, 500));
          }
        }
        
        // 为每个元素创建新的上下文（继承原始内容类型，JSON数据不应当作HTML）
        const elementContext: RuleContext = {
          content: element,
          contentType,
          baseUrl: exploreUrl,
          source: source as unknown as Record<string, unknown>,
          _debugIndex: i, // 用于调试日志
        } as RuleContext;

        const book = await parseExploreBook(source, rule, elementContext, exploreUrl, respondTime);
        if (book) {
          if (i < 10 || bookList.length < 5) {
            console.log(`[explore] 解析书籍[${i}]成功:`, { name: book.name, author: book.author, bookUrl: book.bookUrl?.substring(0, 100) });
          }
          bookList.push(book);
        } else {
          // 只记录前10个失败的元素，避免日志过多
          if (i < 10) {
            const hasNovelname = element.includes('novelname');
            console.warn(`[explore] 解析书籍[${i}]失败 (包含novelname: ${hasNovelname}):`, {
              nameRule: rule.name,
              bookUrlRule: rule.bookUrl,
              elementPreview: element.substring(0, 300),
            });
          }
        }
      }
      
      console.log(`[explore] 处理统计: 总数=${bookElements.length}, 包含novelname的元素数=${novelnameIndices.length}, 成功解析=${bookList.length}`);
      if (novelnameIndices.length > 0 && bookList.length === 0) {
        console.warn(`[explore] 警告: 找到${novelnameIndices.length}个包含novelname的元素，但解析失败。前3个索引:`, novelnameIndices.slice(0, 3));
      }
    } else {
      // 如果没有bookList规则，尝试直接解析单个书籍
      console.log('[explore] 没有 bookList 规则，尝试直接解析');
      const book = await parseExploreBook(source, rule, context, exploreUrl, respondTime);
      if (book) {
        bookList.push(book);
      }
    }

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
    const intro = rule.intro ? await analyzeString(rule.intro, context) : undefined;
    const coverUrl = rule.coverUrl ? await analyzeString(rule.coverUrl, context) : undefined;
    const latestChapterTitle = rule.lastChapter
      ? await analyzeString(rule.lastChapter, context)
      : undefined;
    const latestChapterUpdateTime = rule.updateTime
      ? await analyzeString(rule.updateTime, context)
      : undefined;
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
