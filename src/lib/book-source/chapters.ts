/**
 * 书源章节列表功能
 * 对应 legado 项目的 WebBook.getChapterList
 *
 * 支持两种场景：
 * 1. tocUrl 是标准 HTTP(S) URL → 直接请求，用 ruleToc 解析
 * 2. tocUrl 是 data: URL → 解码内容，提取 book_id 等参数，
 *    构建 ${server}/catalog?book_id=... 请求后解析（模拟 legado ruleToc.chapterList init）
 */

import { get, post } from '@/lib/http';
import { analyzeString, analyzeStringList, type RuleContext } from '@/lib/rule-engine';
import type { BookSource, TocRule } from '@/types';
import type { BookChapter, NewBookChapter } from '@/types';
import { parseHeaders, resolveUrl, detectContentType, decodeDataUrl, extractServerFromJsLib } from '@/lib/book-source/utils';

// ─── data: URL 场景 ───

/**
 * 处理 data: URL 场景的章节列表获取
 * 模拟 legado ruleToc.chapterList 中 JS 规则的行为：
 *   1. 解码 data URL → 提取 book_id / sources / tab
 *   2. 从 jsLib 获取 server 地址
 *   3. POST ${server}/catalog?book_id=...&source=...&tab=...
 *   4. 解析返回的 JSON data 数组为 BookChapter[]
 */
async function getChapterListFromDataUrl(
  source: BookSource,
  tocUrl: string,
): Promise<BookChapter[]> {
  // 1. 解码 data URL
  const payload = decodeDataUrl(tocUrl);
  if (!payload) {
    console.warn('[chapters] 无法解码 data URL');
    return [];
  }
  console.log('[chapters] data URL 载荷:', payload);

  const bookId = payload.book_id;
  if (!bookId) {
    console.warn('[chapters] data URL 中没有 book_id');
    return [];
  }

  // 2. 确定 server 地址
  const serverUrl = extractServerFromJsLib(source as unknown as Record<string, unknown>);
  if (!serverUrl) {
    console.warn('[chapters] 无法从书源获取 server 地址');
    return [];
  }

  // 3. 构建目录 API URL（模拟 ruleToc.chapterList 中的 java.ajax 调用）
  const sources = payload.sources || payload.source || '';
  const tab = payload.tab || '';
  const catalogUrl = `${serverUrl}/catalog?book_id=${encodeURIComponent(bookId)}&source=${encodeURIComponent(sources)}&tab=${encodeURIComponent(tab)}`;
  console.log('[chapters] 请求目录 API:', catalogUrl);

  // 4. POST 请求（书源规则用 POST + body: { html: "" }）
  const headers = parseHeaders(source.header);
  const responseText = await post(
    catalogUrl,
    JSON.stringify({ html: '' }),
    {
      ...headers,
      enableCookieJar: source.enabledCookieJar,
      timeout: 30000,
    },
  );

  const response = JSON.parse(responseText);
  if (response.code !== 0 || !response.data || !Array.isArray(response.data)) {
    console.warn('[chapters] 目录 API 返回异常:', response.msg || response);
    return [];
  }

  console.log('[chapters] 获取到章节数:', response.data.length);

  // 5. 将 API 响应映射为 BookChapter[]
  const chapters: BookChapter[] = response.data.map(
    (item: Record<string, string>, index: number) => {
      // 构建章节内容 URL：与书源 chapterUrl 规则一致，用 data: URL 编码
      const chapterPayload = {
        book_id: bookId,
        item_id: item.item_id || '',
        title: item.title || '',
        sources: item.source || sources,
        tab: item.tab || tab,
        url: item.toc_url || '',
      };
      const chapterDataUrl = `data:;base64,${btoa(
        String.fromCharCode(...new TextEncoder().encode(JSON.stringify(chapterPayload))),
      )},{"type":"qingtian3"}`;

      return {
        url: chapterDataUrl,
        title: (item.title || '').trim(),
        isVolume: false,
        baseUrl: tocUrl,
        bookUrl: '', // 由调用方设置
        index,
        isVip: false,
        isPay: false,
        wordCount: undefined,
      } satisfies BookChapter;
    },
  );

  return chapters;
}

// ─── 标准 HTTP URL 场景 ───

/**
 * 获取章节列表
 * 自动检测 tocUrl 类型，选择对应的处理路径
 */
export async function getChapterList(
  source: BookSource,
  tocUrl: string
): Promise<BookChapter[]> {
  if (!source.ruleToc) {
    return [];
  }

  try {
    // ── data: URL 路径 ──
    if (tocUrl.startsWith('data:')) {
      return await getChapterListFromDataUrl(source, tocUrl);
    }

    // ── 标准 HTTP URL 路径 ──
    const rule = source.ruleToc;
    const headers = parseHeaders(source.header);

    console.log('[chapters] 请求目录 URL:', tocUrl);

    // 检查是否是 /catalog API（独立书源），可能需要 POST 请求
    let html: string;
    if (tocUrl.includes('/catalog')) {
      // 独立书源的 /catalog API 使用 POST 请求，查询参数保留在 URL 中，body 包含 html
      // 格式：POST /catalog?book_id=...&source=...&tab=... body: {html: ''}
      const body = {
        html: '',
      };

      console.log('[chapters] 独立书源 POST 请求目录 API:', tocUrl, 'body:', JSON.stringify(body));

      html = await post(
        tocUrl,
        JSON.stringify(body),
        {
          ...headers,
          enableCookieJar: source.enabledCookieJar,
          timeout: 30000,
        },
      );
    } else {
      // 其他 URL 使用 GET
      html = await get(tocUrl, {
        ...headers,
        enableCookieJar: source.enabledCookieJar,
        concurrentRate: source.concurrentRate,
        timeout: 30000,
      });
    }

    const contentType = detectContentType(html);
    console.log('[chapters] 目录 API 响应类型:', contentType, '长度:', html.length, '前100字符:', html.substring(0, 100));

    // 处理 init 规则（如 "$.data"）：先导航到 JSON 子节点再应用其他规则
    let contextContent = html;
    if ((rule as unknown as { init?: string }).init && contentType === 'json') {
      try {
        const initResult = await analyzeString((rule as unknown as { init: string }).init, {
          content: html,
          contentType,
          baseUrl: tocUrl,
          source: source as unknown as Record<string, unknown>,
        });
        if (initResult) {
          contextContent = initResult;
          console.log('[chapters] init 规则执行结果长度:', initResult.length);
        }
      } catch (e) {
        console.warn('[chapters] init 规则执行失败:', e);
      }
    }

    // 创建规则上下文
    const context: RuleContext = {
      content: contextContent,
      contentType: detectContentType(contextContent),
      baseUrl: tocUrl,
      source: source as unknown as Record<string, unknown>,
    };

    // 解析章节列表
    const chapters: BookChapter[] = [];

    if (rule.chapterList) {
      // 获取章节列表元素
      // 如果规则没有提取器（如 ".dirlist > li"），添加 @all 提取器以获取完整HTML元素
      // 这样后续的子规则（如 "a@text"）可以在完整的元素HTML上应用
      let chapterListRule = rule.chapterList;
      if (!chapterListRule.includes('@')) {
        chapterListRule = `${chapterListRule}@all`;
      }
      
      const chapterElements = await analyzeStringList(chapterListRule, context);
      console.log('[chapters] 提取到章节元素数:', chapterElements.length);

      let chapterIndex = 0;
      for (const element of chapterElements) {
        // 为每个元素创建新的上下文（保持原始内容类型，JSON 元素不应被当作 HTML）
        const elementContext: RuleContext = {
          content: element,
          contentType: detectContentType(element),
          baseUrl: tocUrl,
          source: source as unknown as Record<string, unknown>,
        };

        const chapter = await parseChapter(
          source,
          rule,
          elementContext,
          tocUrl,
          chapterIndex
        );
        if (chapter) {
          chapters.push(chapter);
          chapterIndex++;
        }
      }
    } else {
      // 如果没有chapterList规则，尝试直接解析单个章节
      const chapter = await parseChapter(source, rule, context, tocUrl, 0);
      if (chapter) {
        chapters.push(chapter);
      }
    }

    // 注意：目录倒序功能通常在阅读配置中处理，这里不处理

    return chapters;
  } catch (error) {
    console.error(`获取章节列表失败 [${source.sourceName}]:`, error);
    return [];
  }
}

/**
 * 解析单个章节
 */
async function parseChapter(
  _source: BookSource,
  rule: TocRule,
  context: RuleContext,
  baseUrl: string,
  index: number
): Promise<BookChapter | null> {
  try {
    const title = rule.chapterName ? await analyzeString(rule.chapterName, context) : '';
    const url = rule.chapterUrl ? await analyzeString(rule.chapterUrl, context) : '';

    if (index < 3) {
      console.log(`[chapters] parseChapter[${index}]:`, {
        title,
        url,
        contentType: context.contentType,
        contentPreview: context.content.substring(0, 100),
        chapterUrlRule: rule.chapterUrl,
      });
    }

    if (!title || !url) {
      if (index < 3) {
        console.warn(`[chapters] parseChapter[${index}] 缺少必要字段:`, { title: !!title, url: !!url });
      }
      return null;
    }

    // 判断是否是卷（通常标题包含特定标识或规则中有isVolume）
    let isVolume = false;
    if (rule.isVolume) {
      const volumeResult = await analyzeString(rule.isVolume, context);
      isVolume = Boolean(volumeResult && volumeResult.trim() !== '');
    } else {
      // 默认判断：如果标题看起来像卷名（如"第一卷"、"第一章"等）
      isVolume = /^第?[一二三四五六七八九十百千万\d]+[卷部篇]/u.test(title);
    }

    // 解析章节URL
    const chapterUrl = resolveUrl(baseUrl, url);

    // 解析其他字段
    // 注意：TocRule中没有chapterWordCount字段，如果需要可以从其他规则中获取
    const wordCount = undefined;
    const isVip = rule.isVip
      ? Boolean(await analyzeString(rule.isVip, context))
      : false;
    const isPay = rule.isPay
      ? Boolean(await analyzeString(rule.isPay, context))
      : false;

    return {
      url: chapterUrl,
      title: title.trim(),
      isVolume,
      baseUrl,
      bookUrl: '', // 这个会在调用时设置
      index,
      isVip,
      isPay,
      wordCount,
    };
  } catch (error) {
    console.error('解析章节失败:', error);
    return null;
  }
}

/**
 * 将BookChapter转换为NewBookChapter（用于数据库插入）
 */
export function toNewBookChapter(
  chapter: BookChapter,
  bookUrl: string
): NewBookChapter {
  return {
    url: chapter.url,
    title: chapter.title,
    isVolume: chapter.isVolume,
    baseUrl: chapter.baseUrl,
    bookUrl,
    index: chapter.index,
    isVip: chapter.isVip,
    isPay: chapter.isPay,
    wordCount: chapter.wordCount,
  };
}
