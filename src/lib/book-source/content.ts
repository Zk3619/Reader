/**
 * 书源正文内容功能
 * 对应 legado WebBook.getContentAwait → AnalyzeUrl → BookContent.analyzeContent
 */

import { get, post } from '@/lib/http';
import { analyzeString, type RuleContext } from '@/lib/rule-engine';
import type { BookSource, BookChapter, Book } from '@/types';
import {
  buildBookSourceApiRequestHeaders,
  buildSourceRequestHeaders,
  resolveBookSourceServerUrl,
} from '@/lib/book-source/source-http';
import { resolveUrl, detectContentType, decodeDataUrl, normalizeDataUrlPayload, coalesceSourceField, legadoDataUrlRuleBody, isLegadoTypedDataUrl, readBookContentSource, resolveContentApiItemId } from '@/lib/book-source/utils';
import { processContent, processImageStyle } from '@/lib/book-source/content-processor';
import { extractContentFromRuleOutput } from '@/lib/book-source/extract-rule-content';
import {
  extractApiContent,
  extractApiErrorMessage,
  isApiErrorText,
  resolveApiImageContent,
  summarizeApiContentResponse,
} from '@/lib/book-source/extract-api-content';
import { extractQttokenKey, isInvalidLegadoToken } from '@/lib/js-engine/legado/normalize-legado-ajax-body';
import { assertLoginCheckPassed } from '@/lib/book-source/login-check';
import {
  buildCatalogApiVariable,
  enrichChapterContentPayload,
  readBookCustomFromVariable,
} from '@/lib/book-source/chapters';
import { getSourceArgsKey } from '@/lib/js-engine/legado/source-script-shared';

const MAX_CONTENT_PAGES = 20;
const CONTENT_API_VERSION = '4.11.5.1';

export { isApiErrorText } from '@/lib/book-source/extract-api-content';

export function buildContentApiPostBody(
  payload: Record<string, string>,
  bookVariable?: string,
): string {
  const custom = readBookCustomFromVariable(bookVariable);
  const variable = buildCatalogApiVariable(bookVariable);
  // 对齐常见 ruleContent：custom 为空时 tone_id 默认 '4'（书源脚本内 if (tone_id=='') tone_id='4'）
  const toneId = custom || '4';

  const body: Record<string, string> = {
    html: payload.html ?? '',
    item_id: resolveContentApiItemId(payload.item_id || ''),
    source: coalesceSourceField(payload.sources, payload.source),
    tab: payload.tab || '小说',
    tone_id: toneId,
    variable,
    version: CONTENT_API_VERSION,
  };
  return JSON.stringify(body);
}

/** 规则脚本失败时直连 /content（对齐 Legado ruleContent 请求体） */
async function resolveContentPageHtml(
  source: BookSource,
  payload: Record<string, string>,
): Promise<string> {
  const pageUrl = (payload.url || payload.toc_url || '').trim();
  if (!pageUrl) return '';

  let proxy = '';
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(getSourceArgsKey(source));
      if (raw) {
        const args = JSON.parse(raw) as Record<string, unknown>;
        proxy = typeof args.proxy === 'string' ? args.proxy : '';
      }
    }
  } catch {
    proxy = '';
  }
  if (proxy !== '本地') return '';

  try {
    const headers = buildSourceRequestHeaders(source, pageUrl);
    return await get(pageUrl, {
      headers,
      enableCookieJar: source.enabledCookieJar,
      timeout: 30_000,
    });
  } catch {
    return '';
  }
}

/** 规则脚本失败时直连 /content（对齐 Legado ruleContent 请求体） */
async function requestContentApiDirect(
  source: BookSource,
  payload: Record<string, string>,
  bookVariable?: string,
  bookUrls?: Array<string | undefined>,
): Promise<string | null> {
  const serverUrl = resolveBookSourceServerUrl(source);
  if (!serverUrl || !payload.item_id?.trim()) return null;

  const html = payload.html ?? (await resolveContentPageHtml(source, payload));
  const enrichedPayload = await enrichChapterContentPayload(source, payload, bookUrls);
  const requestPayload = html ? { ...enrichedPayload, html } : enrichedPayload;

  const url = `${serverUrl}/content`;
  const body = buildContentApiPostBody(requestPayload, bookVariable);
  const postSource = coalesceSourceField(
    requestPayload.sources,
    requestPayload.source,
  );
  try {
    const headers = buildBookSourceApiRequestHeaders(source, url);
    headers['Content-Type'] = 'application/json';
    const token = extractQttokenKey(headers.Cookie ?? '');
    if (!token || isInvalidLegadoToken(token)) {
      console.warn('[content] 直连 /content 缺少有效 qttoken Cookie', {
        serverUrl,
        sources: postSource,
        tokenLen: token.length,
      });
    }
    const responseText = await post(url, body, {
      headers,
      enableCookieJar: source.enabledCookieJar,
      timeout: 60_000,
    });
    await assertLoginCheckPassed(source, responseText, url);
    const content = extractApiContent(responseText);
    if (!content?.trim()) {
      const apiErr = extractApiErrorMessage(responseText);
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(responseText) as Record<string, unknown>;
      } catch {
        parsed = null;
      }
      const postBody = JSON.parse(body) as Record<string, unknown>;
      console.warn('[content] 直连 /content 无正文', {
        postSource,
        postTab: postBody.tab,
        apiErr: apiErr || undefined,
        item_id_len: typeof postBody.item_id === 'string' ? postBody.item_id.length : 0,
        hasQttoken: Boolean(extractQttokenKey(headers.Cookie ?? '')),
        response: parsed ? summarizeApiContentResponse(parsed) : undefined,
        bodyPreview: responseText.trim().slice(0, 400),
      });
    }
    if (!content?.trim() || isApiErrorText(content)) {
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

async function fetchChapterPageBody(
  source: BookSource,
  chapter: BookChapter,
  chapterBase: string,
  absoluteUrl: string,
): Promise<string> {
  const isContentApi = absoluteUrl.includes('/content');
  if (isContentApi) {
    try {
      const urlObj = new URL(absoluteUrl);
      const itemId = urlObj.searchParams.get('item_id');
      const sourceParam = urlObj.searchParams.get('source');
      const tab = urlObj.searchParams.get('tab');

      if (itemId) {
        const payload = {
          html: '',
          item_id: itemId,
          sources: sourceParam || '',
          source: sourceParam || '',
          tab: tab || '',
        };
        const body = buildContentApiPostBody(payload);
        const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
        const headers = buildSourceRequestHeaders(source, baseUrl);
        const html = await post(baseUrl, body, {
          headers,
          enableCookieJar: source.enabledCookieJar,
          timeout: 60_000,
        });
        await assertLoginCheckPassed(source, html, baseUrl);
        return html;
      }
    } catch (e) {
      console.warn('[content] 解析章节 URL 失败，使用 GET:', e);
    }
  }

  const { fetchChapterPageHtml } = await import('@/lib/book-source/fetch-source-page');
  const html = await fetchChapterPageHtml(source, absoluteUrl, chapter.baseUrl || chapterBase);
  await assertLoginCheckPassed(source, html, absoluteUrl);
  return html;
}

/**
 * 对齐 WebBook.getContentAwait → AnalyzeUrl.getStrResponseAwait → BookContent.analyzeContent
 * data: URL 且带 type 选项 → hex 载荷；否则 HTTP 抓取 HTML
 */
async function resolveChapterRuleBody(
  source: BookSource,
  chapter: BookChapter,
  chapterBase: string,
): Promise<{ body: string; baseUrl: string; contentType: 'html' | 'json' | 'text' }> {
  const absoluteUrl = resolveUrl(chapterBase, chapter.url);
  const hexBody = legadoDataUrlRuleBody(absoluteUrl);
  if (hexBody != null) {
    return { body: hexBody, baseUrl: absoluteUrl, contentType: 'text' };
  }
  const html = await fetchChapterPageBody(source, chapter, chapterBase, absoluteUrl);
  return {
    body: html,
    baseUrl: absoluteUrl,
    contentType: detectContentType(html),
  };
}

function buildContentRuleContext(
  source: BookSource,
  chapter: BookChapter,
  book: Book | undefined,
  body: string,
  contentType: 'html' | 'json' | 'text',
  baseUrl: string,
): RuleContext {
  return {
    content: body,
    contentType,
    baseUrl,
    result: body,
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
}

async function parseContentByRule(ruleContent: string, context: RuleContext): Promise<string> {
  const trimmed = ruleContent.trim();
  if (!trimmed) return '';
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

// ─── 主入口 ───

export interface GetContentOptions {
  /** 为 true 时不应用数据库替换规则（用于章节缓存落盘） */
  skipReplaceRules?: boolean;
  _visitedUrls?: Set<string>;
}

/**
 * 获取章节正文内容
 * 对齐 Legado WebBook.getContentAwait：AnalyzeUrl 取 body → ruleContent 解析
 */
export async function getContent(
  source: BookSource,
  chapter: BookChapter,
  nextChapterUrl?: string,
  book?: Book,
  options?: GetContentOptions,
): Promise<string | null> {
  if (!source.ruleContent?.content?.trim()) {
    return null;
  }

  const rule = source.ruleContent;
  const contentRule = rule.content!.trim();

  try {
    const chapterBase = chapter.baseUrl || source.sourceUrl || '';
    const absoluteUrl = resolveUrl(chapterBase, chapter.url);

    const visited = options?._visitedUrls ?? new Set<string>();
    if (visited.has(absoluteUrl)) {
      console.warn('[content] 命中正文分页防环，停止继续抓取:', absoluteUrl);
      return null;
    }
    if (visited.size >= MAX_CONTENT_PAGES) {
      console.warn('[content] 命中正文分页上限，停止继续抓取:', {
        max: MAX_CONTENT_PAGES,
        chapterUrl: absoluteUrl,
      });
      return null;
    }
    visited.add(absoluteUrl);

    const typedDataUrl = isLegadoTypedDataUrl(absoluteUrl);
    const contentUrl = absoluteUrl;
    const contentChapter = chapter;

    const { body, baseUrl, contentType } = await resolveChapterRuleBody(
      source,
      contentChapter,
      chapterBase,
    );
    if (typedDataUrl) {
      const decoded = decodeDataUrl(contentUrl);
      if (decoded) {
        console.log('[content] data URL 载荷:', {
          item_id_len: decoded.item_id?.length ?? 0,
          book_id_len: decoded.book_id?.length ?? 0,
          sources: decoded.sources || decoded.source,
          bookSource: readBookContentSource(book),
          tab: decoded.tab,
          title: decoded.title,
        });
      }
    }

    const ruleContext = buildContentRuleContext(
      source,
      contentChapter,
      book,
      body,
      contentType,
      baseUrl,
    );

    let content = extractContentFromRuleOutput(
      (await parseContentByRule(contentRule, ruleContext)) ?? '',
    );
    if (content?.trim() && isApiErrorText(content)) {
      console.warn('[content] 规则返回服务端错误:', content.slice(0, 120));
      content = '';
    }

    if (!content?.trim() && typedDataUrl) {
      const decoded = decodeDataUrl(contentUrl);
      if (decoded?.item_id?.trim()) {
        const payload = normalizeDataUrlPayload(decoded);
        const viaDirect = await requestContentApiDirect(
          source,
          payload,
          book?.variable,
          [book?.tocUrl, book?.bookUrl],
        );
        if (viaDirect?.trim()) {
          console.log('[content] 规则为空，直连 /content 成功，长度:', viaDirect.length);
          content = viaDirect;
        }
      }
    }

    const isContentApi = absoluteUrl.includes('/content');
    if ((!content || !content.trim()) && rule.payAction?.trim()) {
      const payActionExecuted = await executePayAction(source, chapter, ruleContext);
      if (payActionExecuted && contentRule) {
        try {
          const retryHtml = isContentApi
            ? body
            : await get(resolveUrl(chapterBase, chapter.url), {
                headers: buildSourceRequestHeaders(
                  source,
                  resolveUrl(chapterBase, chapter.url),
                ),
                enableCookieJar: source.enabledCookieJar,
                timeout: 60_000,
              });
          const retryContext: RuleContext = {
            ...ruleContext,
            content: retryHtml,
            contentType: detectContentType(retryHtml),
            result: retryHtml,
          };
          content = extractContentFromRuleOutput(
            (await parseContentByRule(contentRule, retryContext)) ?? '',
          );
        } catch (retryError) {
          console.warn('[content] payAction 后重试正文解析失败:', retryError);
        }
      }
    }

    if (!content?.trim()) {
      if (typedDataUrl) {
        const decoded = decodeDataUrl(contentUrl);
        const serverUrl = resolveBookSourceServerUrl(source) ?? '';
        console.warn('[content] 正文规则返回空内容', {
          sources: decoded?.sources || decoded?.source,
          tab: decoded?.tab,
          item_id_len: decoded?.item_id?.length ?? 0,
          book_id_len: decoded?.book_id?.length ?? 0,
          serverUrl: serverUrl || '(未配置)',
          hint: '请确认书源已登录；若已登录请查看上方 /content API 失败原因',
        });
      }
      return null;
    }

    const serverUrl = resolveBookSourceServerUrl(source) ?? '';
    if (serverUrl && (typedDataUrl || isImageHeavyContent(content))) {
      content = resolveApiImageContent(content, serverUrl);
    }

    if (content) {
      console.log(
        `[content] 解析出的正文长度: ${content.length}, 预览: ${content.substring(0, 200)}...`,
      );
    }

    if (content && rule.nextContentUrl && nextChapterUrl) {
      const nextUrl = await analyzeString(rule.nextContentUrl, ruleContext);
      if (nextUrl && nextUrl !== chapter.url) {
        try {
          const nextContent = await getContent(
            source,
            {
              ...chapter,
              url: resolveUrl(chapter.baseUrl || chapterBase, nextUrl),
            },
            undefined,
            book,
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

    if (!content || content.trim().length === 0) {
      return null;
    }

    if (typedDataUrl && isImageHeavyContent(content)) {
      content = processImageStyle(content, 'FULL');
    }

    // 处理正文净化（replaceRegex）— 对齐 Legado analyzeRule.getString(replaceRegex, content)
    if (rule.replaceRegex?.trim()) {
      content = await analyzeString(rule.replaceRegex, {
        ...ruleContext,
        content,
        result: content,
        contentType: 'text',
      });
    }

    if (rule.imageStyle) {
      content = processImageStyle(content, rule.imageStyle);
    }

    if (rule.imageDecode?.trim()) {
      const { applyImageDecode } = await import('@/lib/book-source/image-decode');
      content = await applyImageDecode(
        content,
        rule.imageDecode,
        chapter.baseUrl || chapterBase,
        source,
      );
    }

    const contentBaseUrl = chapter.baseUrl || chapterBase;
    const beforeCleanLength = content?.length || 0;
    const cleanMode = isImageHeavyContent(content) ? 'image' : 'normal';
    content = cleanContent(content, contentBaseUrl, cleanMode);
    const afterCleanLength = content?.length || 0;
    if (beforeCleanLength > 0 && afterCleanLength < beforeCleanLength * 0.5 && cleanMode !== 'image') {
      console.warn(`[content] 清理后内容长度大幅减少: ${beforeCleanLength} -> ${afterCleanLength}, 可能存在问题`);
      content = cleanContent(content, contentBaseUrl, 'light');
    }

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
