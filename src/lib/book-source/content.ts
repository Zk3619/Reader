/**
 * 书源正文内容功能
 * 对应 legado WebBook.getContentAwait → AnalyzeUrl → BookContent.analyzeContent
 */

import { getBookSourcePage, postBookSourcePage } from '@/lib/book-source/source-http-cf';
import { analyzeString, type RuleContext } from '@/lib/rule-engine';
import type { BookSource, BookChapter, Book } from '@/types';
import {
  buildLegadoContentApiRequestHeaders,
  listKnownAggregationServers,
  readBookSourceArgsField,
  resolveBookSourceServerUrl,
} from '@/lib/book-source/source-http';
import {
  resolveUrl,
  detectContentType,
  decodeDataUrl,
  normalizeDataUrlPayload,
  coalesceSourceField,
  legadoDataUrlRuleBody,
  legadoHexEncodeBytes,
  decodeDataUriBase64Payload,
  splitLegadoUrlOptions,
  readBookContentSource,
  buildContentApiItemIdCandidates,
  extractComicIdFromAggregationBookId,
  summarizeAggregationItemIdForDebug,
  buildTypedChapterDataUrl,
  chapterBookIdLooksLikePlaceholder,
  mergeDataUrlPayloadFromBookUrls,
} from '@/lib/book-source/utils';

/** 章节 URL 为 Legado data: 载荷（含或不含 ,{"type":...}） */
function isDataChapterUrl(url: string): boolean {
  return /^data:/i.test(url.trim());
}

function decodeChapterDataPayload(
  chapterBase: string,
  chapterUrl: string,
): Record<string, string> | null {
  try {
    const abs = resolveUrl(chapterBase, chapterUrl);
    return decodeDataUrl(abs);
  } catch {
    return null;
  }
}

/** 章节标题「来源:章节名」补 sources（ruleToc 脚本常留空） */
function mergeSourcesFromChapterTitle(
  payload: Record<string, string>,
  chapterTitle: string,
): Record<string, string> {
  if (payload.sources?.trim()) return payload;
  const m = chapterTitle.trim().match(/^([^:：]+)[:：]/);
  const label = m?.[1]?.trim();
  if (!label) return payload;
  return { ...payload, sources: label, source: label };
}

function chapterDataPayloadNeedsRebuild(
  before: Record<string, string>,
  after: Record<string, string>,
): boolean {
  return (
    (before.book_id?.trim() ?? '') !== (after.book_id?.trim() ?? '') ||
    coalesceSourceField(before.sources, before.source) !==
      coalesceSourceField(after.sources, after.source) ||
    (before.tab?.trim() || '小说') !== (after.tab?.trim() || '小说') ||
    (before.item_id?.trim() ?? '') !== (after.item_id?.trim() ?? '')
  );
}

/** 书架已缓存目录中同 index 章节的 item_id（ruleToc 修复后 URL 可能优于 durChapter 快照） */
async function tryItemIdFromPersistedChapterList(
  book: Book,
  chapter: BookChapter,
): Promise<string | null> {
  const index = chapter.index ?? -1;
  if (index < 0) return null;
  try {
    const { getChapterList } = await import('@/lib/database/chapters');
    const list = await getChapterList(book.bookUrl);
    const row = list[index];
    if (!row?.url?.startsWith('data:')) return null;
    const decoded = decodeDataUrl(row.url);
    const id = decoded?.item_id?.trim();
    return id || null;
  } catch {
    return null;
  }
}

/** 合并书籍/标题上下文并必要时重建 typed data: 章节 URL */
async function normalizeDataChapterUrlForContent(
  source: BookSource,
  chapter: BookChapter,
  contentUrl: string,
  book: Book | undefined,
): Promise<{ url: string; chapter: BookChapter }> {
  const decoded = decodeDataUrl(contentUrl);
  if (!decoded) return { url: contentUrl, chapter };

  let merged = normalizeDataUrlPayload(decoded);
  merged = mergeSourcesFromChapterTitle(merged, chapter.title);
  merged = mergeDataUrlPayloadFromBookUrls(merged, [book?.tocUrl, book?.bookUrl]);
  merged = await enrichChapterContentPayload(
    source,
    merged,
    [book?.tocUrl, book?.bookUrl],
    book?.variable,
  );

  if (!chapterDataPayloadNeedsRebuild(decoded, merged)) {
    return { url: contentUrl, chapter };
  }

  if (!merged.item_id?.trim()) {
    let itemId = await resolveFreshCatalogItemId(
      source,
      merged,
      { title: chapter.title, index: chapter.index ?? 0 },
      book?.variable,
    );
    if (!itemId && book?.bookUrl) {
      itemId = await tryItemIdFromPersistedChapterList(book, chapter);
    }
    if (itemId) {
      merged = normalizeDataUrlPayload({ ...merged, item_id: itemId });
    }
  }

  const nextUrl = buildTypedChapterDataUrl(merged);
  if (import.meta.env.DEV) {
    console.log('[content] 已合并章节 data URL 载荷', {
      chapter: chapter.title,
      book_id_len: merged.book_id?.length ?? 0,
      sources: merged.sources || merged.source,
      tab: merged.tab,
      item_id_len: merged.item_id?.length ?? 0,
      book_id_replaced: chapterBookIdLooksLikePlaceholder(
        decoded.book_id ?? '',
        merged.book_id ?? '',
      ),
    });
  }
  return { url: nextUrl, chapter: { ...chapter, url: nextUrl } };
}

/** 目录缓存错误时章节 URL 可能为「来源:标题」而非 data: 载荷 */
async function tryRepairChapterDataUrl(
  source: BookSource,
  chapter: BookChapter,
  book: Book | undefined,
  chapterBase: string,
): Promise<{ url: string; chapter: BookChapter } | null> {
  const absoluteUrl = resolveUrl(chapterBase, chapter.url);
  if (/^https?:\/\//i.test(absoluteUrl.trim())) return null;

  if (isDataChapterUrl(absoluteUrl)) {
    const decoded = decodeChapterDataPayload(chapterBase, chapter.url);
    if (decoded?.item_id?.trim()) return null;
  }

  let bookPayload: Record<string, string> | null = null;
  for (const u of [book?.tocUrl, book?.bookUrl]) {
    if (!u?.startsWith('data:')) continue;
    const d = decodeDataUrl(resolveUrl(chapterBase, u));
    if (d?.book_id?.trim()) {
      bookPayload = normalizeDataUrlPayload(d);
      break;
    }
  }
  if (!bookPayload?.book_id) return null;

  const titleMatch = chapter.title.trim().match(/^([^:：]+)[:：]\s*(.+)$/);
  const sourcesLabel =
    titleMatch?.[1]?.trim() ||
    coalesceSourceField(bookPayload.sources, bookPayload.source);
  const chapterTitle = titleMatch?.[2]?.trim() || chapter.title.trim();

  let merged = normalizeDataUrlPayload({
    ...bookPayload,
    item_id: '',
    sources: sourcesLabel || bookPayload.sources,
    source: sourcesLabel || bookPayload.source,
    tab: bookPayload.tab || '小说',
    title: chapterTitle,
    url: bookPayload.url ?? bookPayload.toc_url ?? '',
  });

  merged = await enrichChapterContentPayload(
    source,
    merged,
    [book?.tocUrl, book?.bookUrl],
    book?.variable,
  );

  if (!merged.item_id?.trim()) {
    const freshId = await resolveFreshCatalogItemId(
      source,
      merged,
      { title: chapter.title, index: chapter.index ?? 0 },
      book?.variable,
    );
    if (freshId) {
      merged = normalizeDataUrlPayload({ ...merged, item_id: freshId });
    } else {
      const stillBadBookId = chapterBookIdLooksLikePlaceholder(
        merged.book_id ?? '',
        bookPayload.book_id ?? '',
      );
      if (!merged.sources?.trim() || stillBadBookId) {
        return null;
      }
    }
  }

  const contentUrl = buildTypedChapterDataUrl(merged);
  console.log('[content] 已从书籍 data URL + catalog 修复章节 URL', {
    chapter: chapter.title,
    item_id_len: merged.item_id?.length ?? 0,
    sources: merged.sources || merged.source,
    tab: merged.tab,
  });
  return { url: contentUrl, chapter: { ...chapter, url: contentUrl } };
}

/** data: 章节且能解析出 item_id 时可直连 /content */
async function tryDirectContentApiForChapter(
  source: BookSource,
  contentUrl: string,
  chapterBase: string,
  chapterUrl: string,
  book?: Book,
): Promise<string | null> {
  if (!isDataChapterUrl(contentUrl)) return null;
  const decoded = decodeChapterDataPayload(chapterBase, chapterUrl);
  if (!decoded?.item_id?.trim()) return null;
  const payload = normalizeDataUrlPayload(decoded);
  return requestContentApiDirect(
    source,
    payload,
    book?.variable,
    [book?.tocUrl, book?.bookUrl],
  );
}
import { processImageStyle } from '@/lib/book-source/content-processor';
import { logContentImageDiagnostics } from '@/lib/book-source/content-image-debug';
import { summarizeContentPostItemId } from '@/lib/book-source/content-post-debug';
import {
  traceContentFetchStart,
  traceContentFetchDone,
  warnContentFetchOutcome,
} from '@/lib/book-source/content-fetch-trace';
import {
  chapterHtmlHasPlayerVid,
  contentRuleUsesMizhiArtplayerChain,
  tryResolveMizhiArtplayerBrowserUrl,
} from '@/lib/book-source/legado-browser-playback-fallback';
import { scanImgTags } from '@/lib/media/text/scan-img-tags';
import {
  extractContentFromRuleOutput,
  formatLegadoBrowserPlaceholderForReader,
  isLegadoBrowserPlaceholderContent,
  LEGADO_BROWSER_PLACEHOLDER_RE,
} from '@/lib/book-source/extract-rule-content';
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
  createScriptNoticeBus,
  isScriptNoticeBlockedError,
  type ScriptNoticeBus,
} from '@/lib/book-source/rate-limit-guard';
import {
  buildCatalogApiVariable,
  enrichChapterContentPayload,
  readBookCustomFromVariable,
  resolveFreshCatalogItemId,
} from '@/lib/book-source/chapters';
import { getSourceArgsKey } from '@/lib/js-engine/legado/source-script-shared';
import { READER_LAST_BROWSER_URL_KEY } from '@/lib/js-engine/legado/rule-script-browser';
const MAX_CONTENT_PAGES = 20;
const CONTENT_API_VERSION = '4.11.5.1';

function isGyksContentServerPanic(message: string): boolean {
  return /nil pointer dereference/i.test(message);
}

export { isApiErrorText } from '@/lib/book-source/extract-api-content';

/** 调试：对比 Legado 与 Reader 的 item_id 是否一致 */
function postBodyFingerprint(body: string): string {
  const s = body.trim();
  if (!s) return 'empty';
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return `len=${s.length},hash=${(hash >>> 0).toString(16)}`;
}

function itemIdFingerprint(itemId: string): string {
  const s = itemId.trim();
  if (!s) return 'empty';
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  const head = s.slice(0, 16);
  const tail = s.slice(-16);
  return `len=${s.length},hash=${(hash >>> 0).toString(16)},${head}…${tail}`;
}

export function buildContentApiPostBody(
  payload: Record<string, string>,
  bookVariable?: string,
): string {
  const custom = readBookCustomFromVariable(bookVariable);
  const variable = buildCatalogApiVariable(bookVariable);
  // 对齐常见 ruleContent：custom 为空时 tone_id 默认 '4'（书源脚本内 if (tone_id=='') tone_id='4'）
  const toneId = custom || '4';

  // 对齐 Legado ruleContent：POST 用 catalog 短名（全面漫画），不用详情 svip_ 前缀
  const source =
    coalesceSourceField(payload.sources, payload.source).replace(/^svip_/i, '') ||
    coalesceSourceField(payload.sources, payload.source);

  const item_id = (payload.item_id || '').trim();

  const body: Record<string, string> = {
    html: payload.html ?? '',
    item_id,
    source,
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
    return await getBookSourcePage(source, pageUrl, {
      timeout: 30_000,
      cfTitle: `章节正文 — ${source.sourceName?.trim() || '书源'}`,
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
  const primaryServer = resolveBookSourceServerUrl(source);
  if (!primaryServer || !payload.item_id?.trim()) return null;

  const html = payload.html ?? (await resolveContentPageHtml(source, payload));
  const enrichedPayload = await enrichChapterContentPayload(
    source,
    payload,
    bookUrls,
    bookVariable,
  );
  const requestPayload = html ? { ...enrichedPayload, html } : enrichedPayload;

  const serverCandidates = listKnownAggregationServers(source);
  const postSource = coalesceSourceField(
    requestPayload.sources,
    requestPayload.source,
  );

  const rawItemId = requestPayload.item_id?.trim() ?? '';
  const comicIdHint = extractComicIdFromAggregationBookId(
    requestPayload.book_id ?? '',
  );
  const itemIdCandidates = buildContentApiItemIdCandidates(rawItemId, comicIdHint);
  const catalogPostSource = postSource.replace(/^svip_/i, '') || postSource;
  const sourceCandidates = [catalogPostSource];

  try {
    let lastResponseText = '';
    let attempt = 0;
    let lastServer = primaryServer;

    for (const serverUrl of serverCandidates) {
      const url = `${serverUrl}/content`;
      const headers = buildLegadoContentApiRequestHeaders(source, url);
      const token = extractQttokenKey(headers.cookie ?? headers.Cookie ?? '');
      if (!token || isInvalidLegadoToken(token)) {
        console.warn('[content] 直连 /content 缺少有效 qttoken Cookie', {
          serverUrl,
          sources: postSource,
          tokenLen: token.length,
        });
      }

      let serverPanic = false;
      for (const postSourceName of sourceCandidates) {
        for (let i = 0; i < itemIdCandidates.length; i++) {
          const item_id = itemIdCandidates[i]!;
          const body = buildContentApiPostBody(
            {
              ...requestPayload,
              item_id,
              sources: postSourceName,
              source: postSourceName,
            },
            bookVariable,
          );
          if (attempt === 0 && itemIdCandidates.length > 1) {
            console.log('[content] 直连 /content 尝试 catalog item_id', {
              item_id_len: item_id.length,
              item_id_fp: itemIdFingerprint(item_id),
              attempt: i + 1,
            });
          }
          const responseText = await postBookSourcePage(source, url, body, {
            headers,
            timeout: 60_000,
            legadoMinimalHeaders: true,
          });
          lastResponseText = responseText;
          lastServer = serverUrl;
          await assertLoginCheckPassed(source, responseText, url);
          const content = extractApiContent(responseText);
          if (content?.trim() && !isApiErrorText(content)) {
            if (attempt > 0 || serverUrl !== primaryServer) {
              console.log('[content] 直连 /content 回退成功', {
                serverUrl,
                postSource: postSourceName,
                item_id_len: item_id.length,
                item_id_attempt: i + 1,
                contentLen: content.length,
              });
            }
            return content;
          }
          const apiErr = extractApiErrorMessage(responseText);
          if (apiErr && isGyksContentServerPanic(apiErr)) {
            serverPanic = true;
          }
          attempt += 1;
        }
      }
      if (!serverPanic) break;
    }

    const apiErr = extractApiErrorMessage(lastResponseText);
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(lastResponseText) as Record<string, unknown>;
    } catch {
      parsed = null;
    }
    const lastBody = itemIdCandidates.length
      ? (JSON.parse(
        buildContentApiPostBody(
          { ...requestPayload, item_id: itemIdCandidates[itemIdCandidates.length - 1]! },
          bookVariable,
        ),
      ) as Record<string, unknown>)
      : {};
    const lastItemId =
      typeof lastBody.item_id === 'string' ? lastBody.item_id : '';
    console.warn('[content] 直连 /content 无正文', {
      postSource,
      postTab: lastBody.tab,
      apiErr: apiErr || undefined,
      item_id_len: lastItemId.length,
      item_id_fp: lastItemId ? itemIdFingerprint(lastItemId) : undefined,
      post_body_fp: postBodyFingerprint(
        buildContentApiPostBody(
          { ...requestPayload, item_id: lastItemId },
          bookVariable,
        ),
      ),
      item_id_candidates: itemIdCandidates.length,
      item_id_diag: summarizeAggregationItemIdForDebug(
        lastItemId,
        requestPayload.book_id,
      ),
      source_tried: sourceCandidates,
      serverUrl: lastServer,
      hasQttoken: Boolean(extractQttokenKey(
        buildLegadoContentApiRequestHeaders(source, `${lastServer}/content`).cookie ?? '',
      )),
      response: parsed ? summarizeApiContentResponse(parsed) : undefined,
      bodyPreview: lastResponseText.trim().slice(0, 400),
    });
    return null;
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
  scriptNotice?: ScriptNoticeBus,
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
        const html = await postBookSourcePage(source, baseUrl, body, {
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
  const html = await fetchChapterPageHtml(
    source,
    absoluteUrl,
    chapter.baseUrl || chapterBase,
    scriptNotice,
  );
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
  scriptNotice?: ScriptNoticeBus,
): Promise<{ body: string; baseUrl: string; contentType: 'html' | 'json' | 'text' }> {
  const absoluteUrl = resolveUrl(chapterBase, chapter.url);
  const hexBody = legadoDataUrlRuleBody(absoluteUrl);
  if (hexBody != null) {
    return { body: hexBody, baseUrl: absoluteUrl, contentType: 'text' };
  }
  if (/^data:/i.test(absoluteUrl.trim())) {
    const { urlNoOption } = splitLegadoUrlOptions(absoluteUrl);
    const bytes = decodeDataUriBase64Payload(urlNoOption);
    if (bytes?.length) {
      return {
        body: legadoHexEncodeBytes(bytes),
        baseUrl: absoluteUrl,
        contentType: 'text',
      };
    }
    return { body: '', baseUrl: absoluteUrl, contentType: 'text' };
  }
  try {
    const html = await fetchChapterPageBody(
      source,
      chapter,
      chapterBase,
      absoluteUrl,
      scriptNotice,
    );
    const { isBookSourceDebugSession, emitBookSourceDebugCapture, emitBookSourceDebugMessage, BOOK_SOURCE_DEBUG_HTML } =
      await import('@/lib/book-source/book-source-debug-hook');
    if (isBookSourceDebugSession(source.sourceUrl)) {
      emitBookSourceDebugMessage(source.sourceUrl, `≡获取成功:${absoluteUrl}`);
      emitBookSourceDebugCapture(source.sourceUrl, BOOK_SOURCE_DEBUG_HTML.CONTENT, html);
    }
    return {
      body: html,
      baseUrl: absoluteUrl,
      contentType: detectContentType(html),
    };
  } catch (e) {
    if (isScriptNoticeBlockedError(e)) {
      return { body: '', baseUrl: absoluteUrl, contentType: 'text' };
    }
    throw e;
  }
}

function buildContentRuleContext(
  source: BookSource,
  chapter: BookChapter,
  book: Book | undefined,
  body: string,
  contentType: 'html' | 'json' | 'text',
  baseUrl: string,
  onScriptToast?: (msg?: unknown, level?: unknown) => void,
  nonBlockingBrowserAwait = false,
): RuleContext {
  let variables: Record<string, string> | undefined;
  try {
    const abs = resolveUrl(chapter.baseUrl || source.sourceUrl || '', chapter.url);
    if (isDataChapterUrl(abs)) {
      const decoded = decodeDataUrl(abs);
      if (decoded) {
        const normalized = normalizeDataUrlPayload(decoded);
        variables = {
          book_id: normalized.book_id,
          item_id: normalized.item_id,
          sources: normalized.sources,
          source: normalized.source,
          tab: normalized.tab,
          title: normalized.title ?? '',
          url: normalized.url ?? '',
        };
      }
    }
    if (!variables?.book_id && book) {
      for (const url of [book.tocUrl, book.bookUrl]) {
        if (!url?.startsWith('data:')) continue;
        const decoded = decodeDataUrl(url);
        const bookId = decoded?.book_id?.trim();
        if (bookId) {
          variables = { ...(variables ?? {}), book_id: bookId };
          break;
        }
      }
    }
  } catch {
    /* ignore */
  }

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
    variables: variables ?? {},
    onScriptToast,
    nonBlockingBrowserAwait,
  };
}

/** 规则返回占位文案且脚本曾解析出播放页 URL 时打开内嵌页（含 nonBlocking 回退） */
async function maybeOpenRuleContentEmbeddedBrowser(
  source: BookSource,
  book: Book | undefined,
  content: string,
  ruleContext: RuleContext,
): Promise<void> {
  const url = String(ruleContext.variables?.[READER_LAST_BROWSER_URL_KEY] ?? '').trim();
  if (!url.startsWith('http')) return;
  const trimmed = content.trim();
  const isPlaceholder =
    !trimmed ||
    isLegadoBrowserPlaceholderContent(trimmed) ||
    LEGADO_BROWSER_PLACEHOLDER_RE.test(trimmed);
  if (!isPlaceholder) {
    if (trimmed.includes('<img') && scanImgTags(trimmed).length >= 3) return;
    if (trimmed.length > 300) return;
  }

  const { isInnerWebSessionActive } = await import('@/lib/platform/inner-web');
  if (isInnerWebSessionActive()) return;

  const { openLegadoBrowserInApp } = await import('@/lib/platform/open-url');
  const { resolveSourceCookiesForHttp } = await import('@/lib/book-source/source-http');
  const cookieStr = resolveSourceCookiesForHttp(source, url);
  const title = book?.name ?? source.sourceName;
  const poolUrl = (source.bookSourceUrl ?? source.sourceUrl)?.trim();
  void openLegadoBrowserInApp(url, cookieStr, title, {
    awaitClose: false,
    ...(poolUrl ? { bookSourceUrl: poolUrl } : {}),
  });
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
  scriptNotice?: ScriptNoticeBus,
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
      scriptNotice,
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
  /** 正文分页递归时复用同一通知总线 */
  scriptNotice?: ScriptNoticeBus;
  /**
   * 强制拉完 nextContentUrl 链（忽略 nextPageLazyLoad）。
   * 默认：开启懒加载时只取当前页。
   */
  forceFullContentChain?: boolean;
  /** 懒加载模式下解析出的下一页正文 URL */
  onLazyNextContentUrl?: (url: string) => void;
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
    const noticeBus = options?.scriptNotice ?? createScriptNoticeBus(source.sourceName, '正文');
    const onScriptToast = noticeBus.onScriptToast;
    const chapterBase = chapter.baseUrl || source.sourceUrl || '';
    const absoluteUrl = resolveUrl(chapterBase, chapter.url);

    traceContentFetchStart('getContent 开始', {
      source: source.sourceName,
      chapter: chapter.title,
      index: chapter.index,
    });

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

    let contentUrl = absoluteUrl;
    let contentChapter = chapter;

    const repaired = await tryRepairChapterDataUrl(
      source,
      chapter,
      book,
      chapterBase,
    );
    if (repaired) {
      contentUrl = repaired.url;
      contentChapter = repaired.chapter;
    }

    if (isDataChapterUrl(contentUrl)) {
      const normalized = await normalizeDataChapterUrlForContent(
        source,
        contentChapter,
        contentUrl,
        book,
      );
      contentUrl = normalized.url;
      contentChapter = normalized.chapter;
      const prevId = decodeDataUrl(contentUrl)?.item_id?.trim() ?? '';
      if (prevId && import.meta.env.DEV) {
        console.log('[content] 使用章节 URL 内嵌 item_id（未刷新 catalog）', {
          item_id_len: prevId.length,
          item_id_fp: itemIdFingerprint(prevId),
        });
      }
    }

    const { body, baseUrl, contentType } = await resolveChapterRuleBody(
      source,
      contentChapter,
      chapterBase,
      noticeBus,
    );
    warnContentFetchOutcome('章节页已拉取', {
      chapter: chapter.title,
      bodyLen: body.length,
      url: absoluteUrl.slice(0, 120),
    });
    if (!body.trim()) {
      warnContentFetchOutcome('章节页 body 为空，无法执行 ruleContent', {
        chapter: chapter.title,
        url: absoluteUrl,
      });
      return null;
    }
    if (isDataChapterUrl(contentUrl)) {
      const decoded = decodeDataUrl(contentUrl);
      if (decoded) {
        console.log('[content] data URL 载荷:', {
          item_id_len: decoded.item_id?.length ?? 0,
          ...summarizeContentPostItemId(decoded.item_id ?? ''),
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
      onScriptToast,
      /\bjava\.startBrowserAwait\b/.test(contentRule),
    );

    // 对齐 Legado WebBook.getContentAwait：AnalyzeUrl 取 body → ruleContent 解析
    let rawRuleOutput = '';
    try {
      rawRuleOutput = (await parseContentByRule(contentRule, ruleContext)) ?? '';
    } catch (ruleErr) {
      warnContentFetchOutcome('ruleContent 脚本异常', {
        chapter: chapter.title,
        error: ruleErr instanceof Error ? ruleErr.message : String(ruleErr),
      });
    }

    if (!rawRuleOutput.trim() && contentRuleUsesMizhiArtplayerChain(contentRule)) {
      const playbackUrl = await tryResolveMizhiArtplayerBrowserUrl(body, source);
      if (playbackUrl) {
        if (!ruleContext.variables) ruleContext.variables = {};
        ruleContext.variables[READER_LAST_BROWSER_URL_KEY] = playbackUrl;
        rawRuleOutput = '请刷新尝试播放';
        warnContentFetchOutcome('已用 TS 回退解析播放页', {
          playbackUrl: playbackUrl.slice(0, 100),
        });
      }
    }

    const browserPlaybackUrl = String(
      ruleContext.variables?.[READER_LAST_BROWSER_URL_KEY] ?? '',
    ).trim();
    if (
      !rawRuleOutput.trim() &&
      browserPlaybackUrl.startsWith('http') &&
      ruleContext.nonBlockingBrowserAwait
    ) {
      rawRuleOutput = '请刷新尝试播放';
    }
    if (!rawRuleOutput.trim()) {
      warnContentFetchOutcome('ruleContent 无输出', {
        chapter: chapter.title,
        hasPlaybackUrl: browserPlaybackUrl.startsWith('http'),
        bodyHasPlayerJson: chapterHtmlHasPlayerVid(body),
      });
    }

    let content = extractContentFromRuleOutput(rawRuleOutput);
    void maybeOpenRuleContentEmbeddedBrowser(source, book, content, ruleContext);
    if (import.meta.env.DEV && content?.includes('<img')) {
      console.log('[content] ruleContent 解析完成', {
        contentLen: content.length,
        imgCount: scanImgTags(content).length,
        path: 'ruleContent',
      });
    } else if (!content?.trim() && isDataChapterUrl(contentUrl)) {
      console.warn('[content] ruleContent 链未产出正文（将尝试直连 /content）', {
        chapter: chapter.title,
      });
    }
    if (content?.trim() && isApiErrorText(content)) {
      console.warn('[content] 规则返回服务端错误:', content.slice(0, 120));
      content = '';
    }

    // 规则脚本失败时回退直连 /content（与 ruleContent 内 java.ajax 同接口）
    if (!content?.trim()) {
      const viaDirect = await tryDirectContentApiForChapter(
        source,
        contentUrl,
        chapterBase,
        contentChapter.url,
        book,
      );
      if (viaDirect?.trim()) {
        console.log('[content] 规则未返回正文，直连 /content 回退成功，长度:', viaDirect.length);
        content = viaDirect;
      }
    }

    const isContentApi = absoluteUrl.includes('/content');
    if ((!content || !content.trim()) && rule.payAction?.trim()) {
      const payActionExecuted = await executePayAction(
        source,
        chapter,
        ruleContext,
        noticeBus,
      );
      if (payActionExecuted && contentRule) {
        try {
          const retryHtml = isContentApi
            ? body
            : await getBookSourcePage(
              source,
              resolveUrl(chapterBase, chapter.url),
              { timeout: 60_000 },
            );
          const retryContext: RuleContext = {
            ...ruleContext,
            content: retryHtml,
            contentType: detectContentType(retryHtml),
            result: retryHtml,
            onScriptToast,
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
      const browserUrl = String(
        ruleContext.variables?.[READER_LAST_BROWSER_URL_KEY] ?? '',
      ).trim();
      if (browserUrl.startsWith('http')) {
        content = formatLegadoBrowserPlaceholderForReader(
          '请在内嵌页中观看；若未弹出播放页，请点击重试。',
        );
        void maybeOpenRuleContentEmbeddedBrowser(source, book, content, ruleContext);
      }
    }

    if (!content?.trim()) {
      warnContentFetchOutcome('正文为空，拉取失败', {
        chapter: chapter.title,
        playbackUrl: String(ruleContext.variables?.[READER_LAST_BROWSER_URL_KEY] ?? '').slice(
          0,
          100,
        ),
      });
      if (isDataChapterUrl(contentUrl)) {
        const decoded = decodeChapterDataPayload(chapterBase, contentChapter.url);
        const serverUrl = resolveBookSourceServerUrl(source) ?? '';
        const pinnedDevice = readBookSourceArgsField(source, 'deviceId');
        console.warn('[content] 正文规则返回空内容', {
          sources: decoded?.sources || decoded?.source,
          tab: decoded?.tab,
          item_id_len: decoded?.item_id?.length ?? 0,
          book_id_len: decoded?.book_id?.length ?? 0,
          serverUrl: serverUrl || '(未配置)',
          hint: pinnedDevice
            ? '请确认书源已登录；deviceId 已固定，若仍失败请核对 Legado 日志中的 deviceId 是否一致'
            : '与 Legado 共用账号时，请在书源「设置源变量」中填写 "deviceId":"715526ded4651ef6"（Legado 日志值）后重新打开章节',
        });
      }
      return null;
    }

    const serverUrl = resolveBookSourceServerUrl(source) ?? '';
    if (serverUrl && (isDataChapterUrl(contentUrl) || isImageHeavyContent(content))) {
      const beforeResolve = scanImgTags(content).length;
      content = resolveApiImageContent(content, serverUrl);
      const afterResolve = scanImgTags(content).length;
      if (import.meta.env.DEV && beforeResolve > 0 && afterResolve < beforeResolve) {
        console.warn('[content] resolveApiImageContent 后 img 数量减少', {
          before: beforeResolve,
          after: afterResolve,
        });
      }
    }
    if (content?.includes('https://') && content.includes('"headers"')) {
      const { normalizeLegadoContentImages } = await import(
        '@/lib/js-engine/legado/parse-legado-url-options'
      );
      content = normalizeLegadoContentImages(content);
    }

    logContentImageDiagnostics(content, 'normalize后');

    if (content && rule.nextContentUrl && nextChapterUrl) {
      const nextUrl = await analyzeString(rule.nextContentUrl, ruleContext);
      if (nextUrl && nextUrl !== chapter.url) {
        const absoluteNext = resolveUrl(chapter.baseUrl || chapterBase, nextUrl);
        const useLazy =
          Boolean(source.nextPageLazyLoad) && !options?.forceFullContentChain;
        if (useLazy) {
          options?.onLazyNextContentUrl?.(absoluteNext);
        } else {
          try {
            const nextContent = await getContent(
              source,
              {
                ...chapter,
                url: absoluteNext,
              },
              undefined,
              book,
              {
                ...options,
                _visitedUrls: visited,
                scriptNotice: noticeBus,
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
      warnContentFetchOutcome('正文处理后仍为空', { chapter: chapter.title });
      return null;
    }

    if (isDataChapterUrl(contentUrl) && isImageHeavyContent(content)) {
      const scriptImageStyle =
        typeof ruleContext.book?.imageStyle === 'string'
          ? ruleContext.book.imageStyle.trim()
          : '';
      const style = scriptImageStyle || 'FULL';
      content = processImageStyle(content, style);
      logContentImageDiagnostics(content, `processImageStyle(${style})后`);
    }

    // 处理正文净化（replaceRegex）— 对齐 Legado analyzeRule.getString(replaceRegex, content)
    if (rule.replaceRegex?.trim()) {
      content = await analyzeString(rule.replaceRegex, {
        ...ruleContext,
        content,
        result: content,
        contentType: 'text',
        onScriptToast,
      });
    }

    if (rule.imageStyle) {
      content = processImageStyle(content, rule.imageStyle);
      if (isImageHeavyContent(content)) {
        logContentImageDiagnostics(content, `processImageStyle(${rule.imageStyle})后`);
      }
    }

    if (rule.imageDecode?.trim()) {
      const { applyImageDecode } = await import('@/lib/book-source/image-decode');
      content = await applyImageDecode(
        content,
        rule.imageDecode,
        chapter.baseUrl || chapterBase,
        source,
        { onScriptToast },
      );
    }

    const contentBaseUrl = chapter.baseUrl || chapterBase;
    const beforeCleanLength = content?.length || 0;
    const browserPlaceholder = isLegadoBrowserPlaceholderContent(content);
    const cleanMode = isImageHeavyContent(content) ? 'image' : 'normal';
    content = cleanContent(
      content,
      contentBaseUrl,
      browserPlaceholder ? 'light' : cleanMode,
    );
    const afterCleanLength = content?.length || 0;
    if (cleanMode === 'image') {
      logContentImageDiagnostics(content, 'cleanContent(image)后');
    }
    if (beforeCleanLength > 0 && afterCleanLength < beforeCleanLength * 0.5 && cleanMode !== 'image') {
      console.warn(`[content] 清理后内容长度大幅减少: ${beforeCleanLength} -> ${afterCleanLength}, 可能存在问题`);
      content = cleanContent(content, contentBaseUrl, 'light');
    }

    // 替换净化在展示层 processChapterContentForDisplay 统一处理；缓存仅存 raw 正文

    if (isImageHeavyContent(content)) {
      logContentImageDiagnostics(content, '最终正文');
    }
    traceContentFetchDone('getContent 完成', content, {
      path: isDataChapterUrl(contentUrl) ? 'ruleContent+dataUrl' : 'ruleContent',
    });
    warnContentFetchOutcome('getContent 完成', {
      chapter: chapter.title,
      contentLen: content.trim().length,
      placeholder: browserPlaceholder,
    });

    return content;
  } catch (error) {
    warnContentFetchOutcome('getContent 异常', {
      chapter: chapter.title,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error(`获取正文内容失败 [${source.sourceName}]:`, error);
    // 抛出错误以便阅读器显示具体网络/服务器错误信息，而非仅“内容加载失败”
    throw error;
  }
}

/**
 * 从懒加载下一页 URL 起继续抓取并拼接（对齐阅读层按需续页）。
 * 每一页仍走 getContent（此时 nextPageLazyLoad 仍开启，故不会递归整链）。
 */
export async function fetchLazyContentContinuation(
  source: BookSource,
  chapter: BookChapter,
  startNextUrl: string,
  book?: Book,
  options?: Omit<GetContentOptions, 'forceFullContentChain' | 'onLazyNextContentUrl'> & {
    onPageAppended?: (accumulated: string) => void | Promise<void>;
  },
): Promise<string> {
  const visited = options?._visitedUrls ?? new Set<string>();
  let nextUrl: string | undefined = startNextUrl;
  let accumulated = '';
  let guard = 0;

  while (nextUrl && guard < MAX_CONTENT_PAGES) {
    guard += 1;
    if (visited.has(nextUrl)) break;
    let pageNext: string | undefined;
    const page = await getContent(
      source,
      { ...chapter, url: nextUrl },
      undefined,
      book,
      {
        ...options,
        _visitedUrls: visited,
        forceFullContentChain: false,
        onLazyNextContentUrl: (u) => {
          pageNext = u;
        },
      },
    );
    if (!page?.trim()) break;
    accumulated = accumulated ? `${accumulated}\n${page}` : page;
    await options?.onPageAppended?.(accumulated);
    nextUrl = pageNext;
  }

  return accumulated;
}

/**
 * 判断正文是否以图片为主（漫画章节）
 */
function isImageHeavyContent(content: string): boolean {
  if (!content?.includes('<img')) return false;
  const tagCount = scanImgTags(content).length;
  if (tagCount > 0) {
    const withoutImgs = content.replace(/<img[\s\S]*?>/gi, '');
    const textOnly = withoutImgs.replace(/\s+/g, '');
    return textOnly.length < 80 || tagCount >= 3;
  }
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

  // 6. 处理图片标签：保留 img 并转换相对 URL（引号感知，避免隔页丢失）
  if (baseUrl) {
    const absolutizeAttr = (tag: string, attr: 'src' | 'data-src'): string => {
      const re = new RegExp(`\\s${attr}\\s*=\\s*["']([^"']+)["']`, 'i');
      const m = tag.match(re);
      if (!m?.[1]) return tag;
      let src = m[1]!;
      if (
        src &&
        !src.startsWith('http://') &&
        !src.startsWith('https://') &&
        !src.startsWith('data:')
      ) {
        try {
          src = resolveUrl(baseUrl, src);
        } catch {
          /* keep */
        }
      }
      return tag.replace(re, ` ${attr}="${src}"`);
    };

    for (const tag of scanImgTags(content)) {
      let next = absolutizeAttr(tag, 'src');
      next = absolutizeAttr(next, 'data-src');
      if (next !== tag) {
        content = content.replace(tag, next);
      }
    }
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

  // 11. HTML 实体解码（漫画 mode=image 须跳过：含 data-legado-headers 的 img 经 textContent 会被整段剥离）
  if (mode !== 'image' && content.indexOf('&') > -1) {
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
