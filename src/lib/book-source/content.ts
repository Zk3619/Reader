/**
 * 书源正文内容功能
 * 对应 legado 项目的 WebBook.getContent
 *
 * 支持两种场景：
 * 1. chapterUrl 是标准 HTTP(S) URL → 直接请求，用 ruleContent 解析
 * 2. chapterUrl 是 data: URL → 解码内容，提取 item_id 等参数，
 *    POST ${server}/content 请求后获取正文（模拟 legado ruleContent JS 规则）
 */

import { get, post } from '@/lib/http';
import { analyzeString, type RuleContext } from '@/lib/rule-engine';
import type { BookSource, ContentRule, BookChapter, Book } from '@/types';
import {
  buildSourceRequestHeaders,
  resolveAggregationServerUrl,
} from '@/lib/book-source/source-http';
import { resolveUrl, detectContentType, decodeDataUrl, jsonToHex, normalizeDataUrlPayload } from '@/lib/book-source/utils';
import { processContent, processImageStyle } from '@/lib/book-source/content-processor';
import { extractContentFromRuleOutput } from '@/lib/book-source/extract-rule-content';
import { assertLoginCheckPassed } from '@/lib/book-source/login-check';
import {
  buildQingtianCatalogVariable,
  readBookCustomFromVariable,
} from '@/lib/book-source/chapters';

const MAX_CONTENT_PAGES = 20;
const AGGREGATION_CONTENT_API_VERSION = '4.11.5.1';

/** 聚合 /content 返回的服务端错误文案，不应当作正文 */
export function isAggregationApiErrorText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return (
    /正文处理异常/i.test(t) ||
    /nil pointer dereference/i.test(t) ||
    /invalid memory address/i.test(t)
  );
}

export function buildAggregationContentPostBody(
  payload: Record<string, string>,
  bookVariable?: string,
): string {
  const custom = readBookCustomFromVariable(bookVariable);
  const variable = buildQingtianCatalogVariable(bookVariable);
  let toneId = custom;
  if (!toneId) toneId = '4';

  const body: Record<string, string> = {
    html: '',
    item_id: payload.item_id || '',
    source: payload.sources || payload.source || '',
    tab: payload.tab || '小说',
    tone_id: toneId,
    variable,
    version: AGGREGATION_CONTENT_API_VERSION,
  };
  return JSON.stringify(body);
}

/** 规则脚本失败时直连聚合 /content（对齐 Legado ruleContent 请求体） */
async function requestAggregationContentDirect(
  source: BookSource,
  payload: Record<string, string>,
  bookVariable?: string,
): Promise<string | null> {
  const serverUrl = resolveAggregationServerUrl(source);
  if (!serverUrl || !payload.item_id?.trim()) return null;

  const url = `${serverUrl}/content`;
  const body = buildAggregationContentPostBody(payload, bookVariable);
  try {
    const headers = buildSourceRequestHeaders(source, url);
    headers['Content-Type'] = 'application/json';
    const responseText = await post(url, body, {
      headers,
      enableCookieJar: source.enabledCookieJar,
      timeout: 60_000,
    });
    await assertLoginCheckPassed(source, responseText, url);
    const content = extractContentFromRuleOutput(responseText);
    if (!content?.trim() || isAggregationApiErrorText(content)) {
      if (content?.trim()) {
        console.warn('[content] 直连 /content 返回服务端错误:', content.slice(0, 120));
      }
      return null;
    }
    return content;
  } catch (e) {
    console.warn('[content] 直连 /content 失败:', e);
    return null;
  }
}

async function parseContentByRule(ruleContent: string, context: RuleContext): Promise<string> {
  const trimmed = ruleContent.trim();
  if (!trimmed) return '';
  // 对齐 Legado BookContent.analyzeContent：正文规则走 getString（analyzeString），非列表 getStringList
  return (await analyzeString(trimmed, context)) || '';
}

async function executePayAction(
  source: BookSource,
  chapter: BookChapter,
  context: RuleContext,
): Promise<boolean> {
  const payAction = source.ruleContent?.payAction?.trim();
  if (!payAction) return false;
  try {
    const actionResult = (await analyzeString(payAction, context)).trim();
    if (!actionResult) return true;
    const { fetchSourcePage } = await import('@/lib/book-source/fetch-source-page');
    await fetchSourcePage({
      ruleUrl: actionResult,
      source,
      baseUrl: chapter.baseUrl || source.sourceUrl,
    });
    return true;
  } catch (error) {
    console.warn('[content] payAction 执行失败:', error);
    return false;
  }
}

// ─── data: URL 场景 ───

/**
 * 处理 data: URL 场景的正文获取
 * 对齐 Legado AnalyzeUrl(type!=null) → hex 载荷 + ruleContent.content JS：
 *   1. 解码 data URL → 提取 item_id / sources / tab 等
 *   2. JSON → hex（Legado 传给正文规则的 result）
 *   3. 执行 ruleContent.content（含 java.ajax('/content') 与漫画 img 拼接）
 */
async function getContentFromDataUrl(
  source: BookSource,
  chapter: BookChapter,
  book?: Book,
  rule?: ContentRule,
): Promise<{ content: string | null; ruleContext: RuleContext }> {
  const decoded = decodeDataUrl(chapter.url);
  if (!decoded) {
    console.warn('[content] 无法解码 data URL');
    return { content: null, ruleContext: { content: '', contentType: 'text' } };
  }
  console.log('[content] data URL 载荷:', {
    item_id: decoded.item_id,
    sources: decoded.sources || decoded.source,
    tab: decoded.tab,
    title: decoded.title,
  });

  const contentRule = rule?.content?.trim();
  if (!contentRule) {
    console.warn('[content] 无正文规则');
    return { content: null, ruleContext: { content: '', contentType: 'text' } };
  }

  const serverUrl = resolveAggregationServerUrl(source) ?? '';
  const payload = normalizeDataUrlPayload(decoded);
  const hexResult = jsonToHex(JSON.stringify(payload));

  const ruleContext: RuleContext = {
    content: hexResult,
    contentType: 'text',
    baseUrl: chapter.baseUrl || serverUrl || source.sourceUrl || '',
    result: hexResult,
    source: source as unknown as Record<string, unknown>,
    book: book
      ? ({
          ...(book as unknown as Record<string, unknown>),
          durChapterIndex: book.durChapterIndex ?? chapter.index,
          variable: book.variable,
        } as Record<string, unknown>)
      : undefined,
    chapter: chapter as unknown as Record<string, unknown>,
  };

  let content = extractContentFromRuleOutput(
    (await parseContentByRule(contentRule, ruleContext)) ?? '',
  );
  if (content?.trim() && isAggregationApiErrorText(content)) {
    console.warn('[content] 规则返回服务端错误:', content.slice(0, 120));
    content = '';
  }

  if (!content?.trim()) {
    const viaDirect = await requestAggregationContentDirect(
      source,
      payload,
      book?.variable,
    );
    if (viaDirect?.trim()) {
      console.log('[content] 规则为空，直连 /content 成功，长度:', viaDirect.length);
      content = viaDirect;
    }
  }

  if (!content?.trim()) {
    console.warn('[content] 正文规则返回空内容', {
      sources: payload.sources,
      tab: payload.tab,
      item_id_len: payload.item_id?.length ?? 0,
      book_id: payload.book_id || '(无)',
      serverUrl: serverUrl || '(未配置)',
    });
    return { content: null, ruleContext };
  }

  console.log(
    `[content] 解析正文长度: ${content.length}, 预览: ${content.substring(0, 200)}...`,
  );
  return { content, ruleContext };
}

// ─── 主入口 ───

export interface GetContentOptions {
  /** 为 true 时不应用数据库替换规则（用于章节缓存落盘） */
  skipReplaceRules?: boolean;
  _visitedUrls?: Set<string>;
}

/**
 * 获取章节正文内容
 * 自动检测 chapterUrl 类型，选择对应的处理路径
 */
export async function getContent(
  source: BookSource,
  chapter: BookChapter,
  nextChapterUrl?: string,
  book?: Book,
  options?: GetContentOptions,
): Promise<string | null> {
  if (!source.ruleContent) {
    return null;
  }

  const rule = source.ruleContent;

  try {
    const visited = options?._visitedUrls ?? new Set<string>();
    const normalizedChapterUrl = resolveUrl(chapter.baseUrl || source.sourceUrl || '', chapter.url);
    if (visited.has(normalizedChapterUrl)) {
      console.warn('[content] 命中正文分页防环，停止继续抓取:', normalizedChapterUrl);
      return null;
    }
    if (visited.size >= MAX_CONTENT_PAGES) {
      console.warn('[content] 命中正文分页上限，停止继续抓取:', {
        max: MAX_CONTENT_PAGES,
        chapterUrl: normalizedChapterUrl,
      });
      return null;
    }
    visited.add(normalizedChapterUrl);

    let content: string | null = null;
    let ruleContext: RuleContext | undefined;

    // ── data: URL 路径 ──
    if (chapter.url.startsWith('data:')) {
      const dataResult = await getContentFromDataUrl(source, chapter, book, rule);
      content = dataResult.content;
      ruleContext = dataResult.ruleContext;
    } else {
      // ── 标准 HTTP URL 路径 ──
      console.log('[content] 标准 HTTP 路径，章节 URL:', chapter.url);

      // 检查是否是 /content API（独立书源），可能需要 POST 请求
      const isContentApi = chapter.url.includes('/content');
      let html: string;

      if (isContentApi) {
        // 独立书源的 /content API 可能需要 POST 请求，参数在 URL 查询字符串中
        // 尝试解析查询参数并转换为 POST body
        try {
          // 先解析为绝对 URL（如果 chapter.url 是相对路径）
          const absoluteUrl = resolveUrl(chapter.baseUrl || source.sourceUrl || '', chapter.url);
          const urlObj = new URL(absoluteUrl);
          const itemId = urlObj.searchParams.get('item_id');
          const sourceParam = urlObj.searchParams.get('source');
          const tab = urlObj.searchParams.get('tab');
          const version = urlObj.searchParams.get('version') || '4.6.29';

          if (itemId) {
            // 使用 POST 请求，参数在 body 中（与聚合书源一致）
            const body = {
              html: '',
              item_id: itemId,
              source: sourceParam || '',
              tab: tab || '',
              tone_id: '4',
              variable: JSON.stringify({ custom: '' }),
              version: version,
            };

            const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
            console.log('[content] 独立书源 POST 请求:', baseUrl, 'body:', JSON.stringify(body));

            const headers = buildSourceRequestHeaders(source, baseUrl);
            html = await post(
              baseUrl,
              JSON.stringify(body),
              {
                headers,
                enableCookieJar: source.enabledCookieJar,
                timeout: 60000,
              },
            );
            await assertLoginCheckPassed(source, html, baseUrl);
          } else {
            // 如果无法解析参数，回退到 GET
            console.log('[content] 无法解析 item_id，使用 GET 请求');
            const { fetchChapterPageHtml } = await import('@/lib/book-source/fetch-source-page');
            html = await fetchChapterPageHtml(source, absoluteUrl, chapter.baseUrl);
            await assertLoginCheckPassed(source, html, absoluteUrl);
          }
        } catch (e) {
          console.warn('[content] 解析章节 URL 失败，使用 GET:', e);
          const { fetchChapterPageHtml } = await import('@/lib/book-source/fetch-source-page');
          html = await fetchChapterPageHtml(source, chapter.url, chapter.baseUrl);
          await assertLoginCheckPassed(source, html, chapter.url);
        }
      } else {
        const { fetchChapterPageHtml } = await import('@/lib/book-source/fetch-source-page');
        html = await fetchChapterPageHtml(source, chapter.url, chapter.baseUrl);
        await assertLoginCheckPassed(source, html, chapter.url);
      }

      const contentType = detectContentType(html);

      // 创建规则上下文
      ruleContext = {
        content: html,
        contentType,
        baseUrl: chapter.baseUrl,
        result: html,
        source: {
          ...(source as unknown as Record<string, unknown>),
          bookSourceComment:
            source.sourceComment ??
            (source as { bookSourceComment?: string }).bookSourceComment ??
            '',
          sourceComment:
            source.sourceComment ??
            (source as { bookSourceComment?: string }).bookSourceComment ??
            '',
          bookSourceUrl: source.sourceUrl,
        },
        book: book
          ? ({
              ...(book as unknown as Record<string, unknown>),
              durChapterIndex: book.durChapterIndex ?? chapter.index,
            } as Record<string, unknown>)
          : undefined,
        chapter: chapter as unknown as Record<string, unknown>,
      };

      // 解析正文内容
      content = rule.content ? await parseContentByRule(rule.content, ruleContext) : '';

      if ((!content || !content.trim()) && rule.payAction?.trim()) {
        const payActionExecuted = await executePayAction(source, chapter, ruleContext);
        if (payActionExecuted && rule.content) {
          try {
            const retryHtml = isContentApi
              ? html
              : await get(resolveUrl(chapter.baseUrl || source.sourceUrl || '', chapter.url), {
                  headers: buildSourceRequestHeaders(
                    source,
                    resolveUrl(chapter.baseUrl || source.sourceUrl || '', chapter.url),
                  ),
                  enableCookieJar: source.enabledCookieJar,
                  timeout: 60000,
                });
            const retryContext: RuleContext = {
              ...ruleContext,
              content: retryHtml,
              contentType: detectContentType(retryHtml),
              result: retryHtml,
            };
            content = await parseContentByRule(rule.content, retryContext);
          } catch (retryError) {
            console.warn('[content] payAction 后重试正文解析失败:', retryError);
          }
        }
      }

      // 调试：记录解析出的内容长度和预览
      if (content) {
        console.log(`[content] 解析出的正文长度: ${content.length}, 预览: ${content.substring(0, 200)}...`);
      }

      // 处理下一页内容
      if (content && rule.nextContentUrl && nextChapterUrl) {
        const nextUrl = await analyzeString(rule.nextContentUrl, ruleContext);
        if (nextUrl && nextUrl !== chapter.url) {
          try {
            const nextContent = await getContent(
              source,
              { ...chapter, url: resolveUrl(chapter.baseUrl, nextUrl) },
              undefined,
              undefined,
              {
                ...options,
                _visitedUrls: visited,
              },
            );
            if (nextContent) {
              content += '\n' + nextContent;
            }
          } catch {
            // 获取下一页失败，忽略
          }
        }
      }
    }

    if (!content || content.trim().length === 0) {
      return null;
    }

    // 处理正文净化（replaceRegex）— 对齐 Legado analyzeRule.getString(replaceRegex, content)
    if (rule.replaceRegex?.trim() && ruleContext) {
      content = await analyzeString(rule.replaceRegex, {
        ...ruleContext,
        content,
        result: content,
        contentType: 'text',
      });
    }

    // 处理图片样式
    if (rule.imageStyle) {
      content = processImageStyle(content, rule.imageStyle);
    }

    if (rule.imageDecode?.trim()) {
      const { applyImageDecode } = await import('@/lib/book-source/image-decode');
      content = await applyImageDecode(
        content,
        rule.imageDecode,
        chapter.baseUrl,
        source,
      );
    }

    // 清理内容（传递baseUrl用于图片URL绝对路径转换）
    const beforeCleanLength = content?.length || 0;
    const cleanMode = isImageHeavyContent(content) ? 'image' : 'normal';
    content = cleanContent(content, chapter.baseUrl, cleanMode);
    const afterCleanLength = content?.length || 0;
    if (beforeCleanLength > 0 && afterCleanLength < beforeCleanLength * 0.5 && cleanMode !== 'image') {
      console.warn(`[content] 清理后内容长度大幅减少: ${beforeCleanLength} -> ${afterCleanLength}, 可能存在问题`);
      content = cleanContent(content, chapter.baseUrl, 'light');
    }

    // 应用替换规则（从数据库获取）
    if (book && !options?.skipReplaceRules) {
      content = await processContent(content, book.name, source.sourceUrl);
    }

    return content;
  } catch (error) {
    console.error(`获取正文内容失败 [${source.sourceName}]:`, error);
    // 抛出错误以便阅读器显示具体网络/服务器错误信息，而非仅“内容加载失败”
    throw error;
  }
}

/**
 * 判断正文是否以图片为主（漫画章节）
 */
function isImageHeavyContent(content: string): boolean {
  if (!content?.includes('<img')) return false;
  const withoutImgs = content.replace(/<img[^>]*>/gi, '').replace(/\s+/g, '');
  return withoutImgs.length < 80;
}

/**
 * 清理正文内容
 * 参考 legado 的 HtmlFormatter.formatKeepImg 实现
 */
function cleanContent(
  content: string,
  baseUrl: string = '',
  mode: 'normal' | 'light' | 'image' = 'normal',
): string {
  if (!content) return '';

  // 1. 处理HTML实体：将多个连续的&nbsp;替换为单个空格
  content = content.replace(/(&nbsp;)+/gi, ' ');

  // 2. 处理其他空格实体
  content = content.replace(/(&ensp;|&emsp;)/gi, ' ');

  // 3. 移除不可打印的零宽字符
  content = content.replace(/(&thinsp;|&zwnj;|&zwj;|\u2009|\u200C|\u200D)/g, '');

  // 4. 将换行相关的HTML标签转换为换行符（div, p, br, hr, h1-h6, article, dd, dl）
  content = content.replace(/<\/?(?:div|p|br|hr|h\d|article|dd|dl)[^>]*>/gi, '\n');

  // 5. 移除HTML注释
  content = content.replace(/<!--[\s\S]*?-->/g, '');

  // 6. 处理图片标签：保留img标签并转换相对URL为绝对URL
  if (baseUrl) {
    // 匹配img标签，提取src属性并转换为绝对URL
    content = content.replace(/<img([^>]*)\ssrc\s*=\s*["']([^"']+)["']([^>]*)>/gi, (_match, before, src, after) => {
      // 如果src不是绝对URL，转换为绝对URL
      if (src && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:')) {
        try {
          src = resolveUrl(baseUrl, src);
        } catch {
          // 转换失败，保持原样
        }
      }
      return `<img${before} src="${src}"${after}>`;
    });

    // 处理data-src属性（懒加载图片）
    content = content.replace(/<img([^>]*)\sdata-src\s*=\s*["']([^"']+)["']([^>]*)>/gi, (_match, before, src, after) => {
      if (src && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:')) {
        try {
          src = resolveUrl(baseUrl, src);
        } catch {
          // 转换失败，保持原样
        }
      }
      return `<img${before} data-src="${src}"${after}>`;
    });
  }

  // 7. 移除所有非img的HTML标签（保留img标签用于图片显示）
  // 使用负向前瞻确保不匹配img标签
  content = content.replace(/<\/?(?!img)[a-zA-Z]+(?=[ >])[^<>]*>/gi, '');

  // 8. 处理缩进：多个换行和空白字符替换为换行+全角空格（段落缩进）
  if (mode === 'image') {
    content = content.replace(/\s*\n+\s*/g, '\n');
  } else {
    content = content.replace(/\s*\n+\s*/g, mode === 'light' ? '\n' : '\n　　');
  }

  // 9. 移除开头和结尾的空白
  content = content.replace(/^[\n\s]+/, '');
  content = content.replace(/[\n\s]+$/, '');

  // 10. 统一换行符
  content = content.replace(/\r\n/g, '\n');
  content = content.replace(/\r/g, '\n');

  // 11. 如果内容包含&符号，unescape HTML实体（如 &lt; &gt; &amp; &nbsp; 等）
  if (content.indexOf('&') > -1) {
    if (typeof document !== 'undefined') {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = content;
      content = tempDiv.textContent || tempDiv.innerText || content;
    } else {
      content = content
        .replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'");
    }
  }

  // 12. 移除多余的连续换行（最多保留两个）
  content = content.replace(/\n{3,}/g, '\n\n');

  // 13. 移除常见的广告文本
  if (mode === 'normal') {
    const adPatterns = [
      /请收藏[：:]\s*[^\n]+/g,
      /本章完[，,。.]/g,
      /未完待续[，,。.]/g,
    ];

    for (const pattern of adPatterns) {
      content = content.replace(pattern, '');
    }
  }

  return content.trim();
}
