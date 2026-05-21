/**
 * 书源详情功能
 * 对应 legado 项目的 WebBook.getBookInfo
 *
 * 支持两种场景：
 * 1. bookUrl 是标准 HTTP(S) URL → 直接请求，用 ruleBookInfo 解析
 * 2. bookUrl 是 data: URL → 解码内容，提取 book_id 等参数，
 *    构建真实 API URL 请求后解析（模拟 legado ruleBookInfo.init 行为）
 */

import { get } from '@/lib/http';
import { analyzeString, type RuleContext } from '@/lib/rule-engine';
import type { BookSource } from '@/types';
import type { BookInfo } from '@/types';
import { parseHeaders, resolveUrl, detectContentType, decodeDataUrl, extractServerFromJsLib } from '@/lib/book-source/utils';

/**
 * 处理 data: URL 场景的 getBookInfo
 * 模拟 legado ruleBookInfo.init 的行为：
 *   1. 解码 data URL → 提取 book_id / sources / tab
 *   2. 从 jsLib 获取 server 地址
 *   3. 构建 ${server}/detail?book_id=...&source=...&tab=... 并请求
 *   4. 解析返回的 JSON
 */
async function getBookInfoFromDataUrl(
  source: BookSource,
  bookUrl: string,
): Promise<BookInfo | null> {
  // 1. 解码 data URL
  const payload = decodeDataUrl(bookUrl);
  if (!payload) {
    console.warn('[detail] 无法解码 data URL');
    return null;
  }
  console.log('[detail] data URL 载荷:', payload);

  const bookId = payload.book_id;
  if (!bookId) {
    console.warn('[detail] data URL 中没有 book_id');
    return null;
  }

  // 2. 确定 server 地址
  const serverUrl = extractServerFromJsLib(source as unknown as Record<string, unknown>);
  if (!serverUrl) {
    console.warn('[detail] 无法从书源获取 server 地址');
    return null;
  }

  // 3. 构建详情 API URL（遵循 ruleBookInfo.init 的模式）
  const sources = payload.sources || payload.source || '';
  const tab = payload.tab || '';
  const detailUrl = `${serverUrl}/detail?book_id=${encodeURIComponent(bookId)}&source=${encodeURIComponent(sources)}&tab=${encodeURIComponent(tab)}`;
  console.log('[detail] 请求详情 API:', detailUrl);

  // 4. 请求并解析
  const headers = parseHeaders(source.header);
  const responseText = await get(detailUrl, {
    ...headers,
    enableCookieJar: source.enabledCookieJar,
    timeout: 15000,
  });
  const response = JSON.parse(responseText);

  if (response.code !== 0 || !response.data) {
    console.warn('[detail] 详情 API 返回异常:', response.msg || response);
    return null;
  }

  const d = response.data;
  console.log('[detail] 详情 API 响应:', {
    book_name: d.book_name,
    author: d.author,
    hasAbstract: !!d.abstract,
    hasLastChapter: !!d.last_chapter_title,
    source: d.source,
    status: d.status,
    score: d.score,
  });

  return {
    bookUrl,
    name: d.book_name || '',
    author: d.author || '',
    kind: d.category || d.tags || undefined,
    intro: d.abstract || undefined,
    coverUrl: d.thumb_url || undefined,
    wordCount: d.word_number || undefined,
    latestChapterTitle: d.last_chapter_title || undefined,
    latestChapterUpdateTime: d.last_chapter_update_time || undefined,
    tocUrl: bookUrl, // 保持原始 data URL，后续目录页也需要解码
    origin: source.sourceUrl,
    originName: source.sourceName,
    // 扩展字段
    source: d.source || undefined,
    status: d.status || undefined,
    tab: d.tab || undefined,
    category: d.category || undefined,
    tags: d.tags || undefined,
    score: d.score || undefined,
  };
}

// ─── 主入口 ───

/**
 * 获取书籍详情
 * 自动检测 bookUrl 类型，选择对应的处理路径
 */
export async function getBookInfo(
  source: BookSource,
  bookUrl: string
): Promise<BookInfo | null> {
  if (!source.ruleBookInfo) {
    return null;
  }

  try {
    // ── data: URL 路径 ──
    if (bookUrl.startsWith('data:')) {
      return await getBookInfoFromDataUrl(source, bookUrl);
    }

    // ── 标准 HTTP URL 路径 ──
    const rule = source.ruleBookInfo;
    const headers = parseHeaders(source.header);
    const html = await get(bookUrl, {
      ...headers,
      enableCookieJar: source.enabledCookieJar,
      concurrentRate: source.concurrentRate,
      timeout: 30000,
    });

    const contentType = detectContentType(html);

    // 处理 init 规则（如 "$.data"）：先导航到 JSON 子节点再应用其他规则
    let contextContent = html;
    if (rule.init && contentType === 'json') {
      try {
        const initResult = await analyzeString(rule.init, {
          content: html,
          contentType,
          baseUrl: bookUrl,
          source: source as unknown as Record<string, unknown>,
        });
        if (initResult) {
          contextContent = initResult;
        }
      } catch (e) {
        console.warn('[detail] init 规则执行失败:', e);
      }
    }

    const context: RuleContext = {
      content: contextContent,
      contentType: detectContentType(contextContent),
      baseUrl: bookUrl,
      source: source as unknown as Record<string, unknown>,
    };

    // 解析书籍信息
    const name = rule.name ? await analyzeString(rule.name, context) : '';
    const author = rule.author ? await analyzeString(rule.author, context) : '';
    const intro = rule.intro ? await analyzeString(rule.intro, context) : undefined;
    const coverUrl = rule.coverUrl ? await analyzeString(rule.coverUrl, context) : undefined;
    const kind = rule.kind ? await analyzeString(rule.kind, context) : undefined;
    const wordCount = rule.wordCount ? await analyzeString(rule.wordCount, context) : undefined;
    const latestChapterTitle = rule.lastChapter
      ? await analyzeString(rule.lastChapter, context)
      : undefined;
    const latestChapterUpdateTime = rule.updateTime
      ? await analyzeString(rule.updateTime, context)
      : undefined;

    if (!name) {
      return null;
    }

    // 解析 tocUrl（目录页URL）
    let tocUrl = bookUrl;
    if (rule.tocUrl) {
      const parsedTocUrl = await analyzeString(rule.tocUrl, context);
      if (parsedTocUrl) {
        tocUrl = resolveUrl(bookUrl, parsedTocUrl);
      }
    }

    return {
      bookUrl,
      name,
      author: author || '',
      kind,
      intro,
      coverUrl: coverUrl ? resolveUrl(bookUrl, coverUrl) : undefined,
      wordCount,
      latestChapterTitle,
      latestChapterUpdateTime,
      tocUrl,
      origin: source.sourceUrl,
      originName: source.sourceName,
    };
  } catch (error) {
    console.error(`获取书籍详情失败 [${source.sourceName}]:`, error);
    return null;
  }
}
