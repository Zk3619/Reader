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
import { legadoListRuleNeedsAllSuffix } from '@/lib/rule-engine/legado-source-rule';
import { analyzeListElements, analyzeString, analyzeStringList, type RuleContext } from '@/lib/rule-engine';
import { parseAjaxArgs } from '@/lib/js-engine/legado/host/parse-ajax';
import type { BookSource, TocRule } from '@/types';
import type { BookChapter, NewBookChapter } from '@/types';
import {
  buildBookSourceApiRequestHeaders,
  buildSourceRequestHeaders,
  resolveBookSourceServerUrl,
} from '@/lib/book-source/source-http';
import { getSourceArgsKey } from '@/lib/js-engine/legado/source-script-shared';
import { readAggregationApiFailure } from '@/lib/book-source/extract-api-content';
import {
  resolveUrl,
  detectContentType,
  decodeDataUrl,
  jsonToHex,
  normalizeChapterDataUrl,
  normalizeDataUrlPayload,
  buildCatalogBookIdCandidates,
  coalesceSourceField,
  buildTypedChapterDataUrl,
  mergeBookIdFromBookUrls,
  normalizeCatalogScalarField,
} from '@/lib/book-source/utils';
import { settingsStore } from '@/stores/settings';
import { evalJs, type JsContext } from '@/lib/js-engine';
import { runLegadoRuleScript } from '@/lib/js-engine/legado/rule-script-runner';
import { enrichJsonListItemContext } from '@/lib/book-source/json-list-context';
import { assertLoginCheckPassed } from '@/lib/book-source/login-check';

const DEFAULT_TOC_PAGINATION_MAX_PAGES = 80;
const HARD_TOC_PAGINATION_MAX_PAGES = 5000;

/** 渐进加载中间结果（对齐 Legado PartialChapterList） */
export type PartialChapterList = {
  chapters: BookChapter[];
  isComplete: boolean;
};

/** 与 Legado BookChapterList 一致的目录排序选项 */
export interface GetChapterListOptions {
  /** 对应 book.readConfig.reverseToc / Book.getReverseToc() */
  reverseToc?: boolean;
  /** 每加载完一页目录后回调（formatJs 仅在 isComplete 时执行） */
  onPartial?: (partial: PartialChapterList) => void | Promise<void>;
  /** 书架书籍 variable（对齐 Legado book.getVariable('custom')） */
  bookVariable?: string;
}

type TocPartialListener = NonNullable<GetChapterListOptions['onPartial']>;

type TocFetchEntry = {
  promise: Promise<BookChapter[]>;
  listeners: Set<TocPartialListener>;
};

const tocFetchInFlight = new Map<string, TocFetchEntry>();

export function tocFetchKey(source: BookSource, tocUrl: string): string {
  return `${source.bookSourceUrl}\0${tocUrl}`;
}

export function isChapterListFetchInFlight(source: BookSource, tocUrl: string): boolean {
  return tocFetchInFlight.has(tocFetchKey(source, tocUrl));
}

function dispatchTocPartialListeners(
  listeners: Set<TocPartialListener>,
  partial: PartialChapterList,
): void {
  for (const listener of listeners) {
    void Promise.resolve(listener(partial)).catch((e) => {
      console.warn('[chapters] onPartial 失败:', e);
    });
  }
}

/** 同一 tocUrl 并发去重；支持多个 onPartial 订阅（详情预加载 + 后台上架） */
export function fetchChapterListDeduped(
  source: BookSource,
  tocUrl: string,
  options?: GetChapterListOptions,
): Promise<BookChapter[]> {
  const key = tocFetchKey(source, tocUrl);
  const existing = tocFetchInFlight.get(key);
  if (existing) {
    if (options?.onPartial) existing.listeners.add(options.onPartial);
    return existing.promise;
  }

  const listeners = new Set<TocPartialListener>();
  if (options?.onPartial) listeners.add(options.onPartial);

  const promise = getChapterList(source, tocUrl, {
    ...options,
    onPartial: (partial) => dispatchTocPartialListeners(listeners, partial),
  }).finally(() => {
    tocFetchInFlight.delete(key);
  });

  tocFetchInFlight.set(key, { promise, listeners });
  return promise;
}

/**
 * 解析 ruleToc.chapterList 的 `-` / `+` 前缀（Legado BookChapterList.analyzeChapterList）
 */
export function parseTocChapterListRule(chapterList?: string): {
  listRule: string;
  reverse: boolean;
} {
  let listRule = chapterList?.trim() ?? '';
  let reverse = false;
  if (listRule.startsWith('-')) {
    reverse = true;
    listRule = listRule.slice(1);
  }
  if (listRule.startsWith('+')) {
    listRule = listRule.slice(1);
  }
  return { listRule, reverse };
}

/**
 * 目录合并后的去重、正倒序与 index 编号（对齐 Legado sortAndIndex + LinkedHashSet）
 */
export function finalizeTocChapterOrder(
  chapterList: BookChapter[],
  reverse: boolean,
  reverseToc: boolean,
): BookChapter[] {
  if (chapterList.length === 0) return chapterList;
  const list = [...chapterList];
  if (!reverse) {
    list.reverse();
  }
  const seen = new Set<string>();
  const deduped: BookChapter[] = [];
  for (const ch of list) {
    if (seen.has(ch.url)) continue;
    seen.add(ch.url);
    deduped.push(ch);
  }
  if (!reverseToc) {
    deduped.reverse();
  }
  return deduped.map((chapter, index) => ({ ...chapter, index }));
}

function getTocPaginationSafetyOptions(): { enabled: boolean; maxPages: number } {
  const app = settingsStore.state.app;
  const enabled = app.tocPaginationSafetyEnabled !== false;
  const rawMax = app.tocPaginationMaxPages;
  const maxPages =
    typeof rawMax === 'number' && Number.isFinite(rawMax)
      ? Math.max(1, Math.min(HARD_TOC_PAGINATION_MAX_PAGES, Math.floor(rawMax)))
      : DEFAULT_TOC_PAGINATION_MAX_PAGES;
  return { enabled, maxPages };
}

async function notifyTocPaginationSafetyHit(payload: {
  sourceName: string;
  maxPages: number;
  tocUrl: string;
  truncatedPages: number;
  pendingPages: number;
}) {
  try {
    const { showAppToast } = await import('@/components/shared/AppToasts');
    showAppToast({
      title: '目录分页达到安全阈值，已停止继续抓取',
      description:
        `[${payload.sourceName}] 最大页数 ${payload.maxPages}；` +
        `被截断页数 ${payload.truncatedPages}；待抓取页数 ${payload.pendingPages}；` +
        `入口：${payload.tocUrl}`,
      variant: 'default',
    });
  } catch (e) {
    console.warn('[chapters] AppToast 通知失败:', e);
  }
}

async function applyPreUpdateJs(
  source: BookSource,
  rule: TocRule,
  html: string,
  currentTocUrl: string,
): Promise<string> {
  const preUpdateJs = rule.preUpdateJs?.trim();
  if (!preUpdateJs) return html;
  try {
    const context: RuleContext = {
      content: html,
      contentType: detectContentType(html),
      baseUrl: currentTocUrl,
      result: html,
      source: source as unknown as Record<string, unknown>,
    };
    const output = await analyzeString(preUpdateJs, context);
    const next = output.trim();
    return next ? next : html;
  } catch (error) {
    console.warn('[chapters] preUpdateJs 执行失败，回退原始目录内容:', error);
    return html;
  }
}

async function applyFormatJs(
  source: BookSource,
  rule: TocRule,
  chapters: BookChapter[],
  currentTocUrl: string,
): Promise<BookChapter[]> {
  const formatJs = rule.formatJs?.trim();
  if (!formatJs || chapters.length === 0) return chapters;
  try {
    const jsResult = await evalJs(formatJs, {
      result: chapters,
      baseUrl: currentTocUrl,
      source: source as unknown as Record<string, unknown>,
    });
    if (!Array.isArray(jsResult)) return chapters;

    const normalized: BookChapter[] = [];
    for (const rawItem of jsResult) {
      if (!rawItem || typeof rawItem !== 'object') continue;
      const row = rawItem as Record<string, unknown>;
      const title = String(row.title ?? row.chapterName ?? '').trim();
      const url = String(row.url ?? row.chapterUrl ?? '').trim();
      if (!title || !url) continue;
      normalized.push({
        url: resolveUrl(currentTocUrl, url),
        title,
        isVolume: Boolean(row.isVolume),
        baseUrl: currentTocUrl,
        bookUrl: '',
        index: normalized.length,
        isVip: Boolean(row.isVip),
        isPay: Boolean(row.isPay),
        wordCount: row.wordCount == null ? undefined : String(row.wordCount),
      });
    }
    return normalized.length > 0 ? normalized : chapters;
  } catch (error) {
    console.warn('[chapters] formatJs 执行失败，保留原始目录解析结果:', error);
    return chapters;
  }
}

// ─── data: URL 场景 ───

/** 对齐 Legado book.getVariable('custom')：从 book.variable JSON 取 custom 字段 */
export function readBookCustomFromVariable(bookVariable?: string): string {
  let raw = (bookVariable ?? '').trim();
  if (!raw || raw === 'null') return '';
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const custom = parsed.custom;
      return custom == null ? '' : String(custom);
    } catch {
      return '';
    }
  }
  return raw;
}

/** 对齐 Legado ruleToc.chapterList / ruleContent 的 catalog variable 参数 */
export function buildCatalogApiVariable(bookVariable?: string): string {
  return JSON.stringify({ custom: readBookCustomFromVariable(bookVariable) });
}

function withJsonPostHeaders(
  headers: Record<string, string>,
  body: string,
): Record<string, string> {
  const next = { ...headers };
  const trimmed = body.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    next['Content-Type'] ??= 'application/json';
  }
  return next;
}

/** 正文请求前补全章节载荷（仅 book_id；source 保持 catalog/章节载荷，对齐 Legado） */
export async function enrichChapterContentPayload(
  _source: BookSource,
  payload: Record<string, string>,
  bookUrls?: Array<string | undefined>,
  _bookVariable?: string,
): Promise<Record<string, string>> {
  return mergeBookIdFromBookUrls(payload, bookUrls);
}

/** 从 /catalog API 响应（code=0）中提取章节行 */
export function extractCatalogChapterRows(
  response: unknown,
): Record<string, unknown>[] | null {
  if (!response || typeof response !== 'object') return null;
  const root = response as Record<string, unknown>;
  const code = root.code;
  if (code !== 0 && code !== '0') return null;

  const data = root.data;
  if (Array.isArray(data)) {
    return data.filter((row) => row && typeof row === 'object') as Record<string, unknown>[];
  }
  if (data && typeof data === 'object') {
    const nested = data as Record<string, unknown>;
    for (const key of ['data', 'list', 'items', 'chapters']) {
      const rows = nested[key];
      if (Array.isArray(rows)) {
        return rows.filter((row) => row && typeof row === 'object') as Record<
          string,
          unknown
        >[];
      }
    }
  }
  return null;
}

function normalizeCatalogRow(
  item: Record<string, unknown>,
  sources: string,
  tab: string,
): Record<string, unknown> {
  const rowSources = coalesceSourceField(
    normalizeCatalogScalarField(item.source),
    normalizeCatalogScalarField(item.sources),
    sources,
  );
  return {
    ...item,
    source: rowSources,
    sources: rowSources,
    item_id: normalizeCatalogScalarField(item.item_id),
    title: normalizeCatalogScalarField(item.title),
    tab: normalizeCatalogScalarField(item.tab) || tab,
    toc_url: normalizeCatalogScalarField(item.toc_url ?? item.url),
    url: normalizeCatalogScalarField(item.url ?? item.toc_url),
  };
}

/** catalog 回退路径也走 ruleToc.chapterUrl（对齐 Legado $.data + chapterUrl） */
async function mapCatalogRowsToChapters(
  source: BookSource,
  rule: TocRule | undefined,
  rows: Record<string, unknown>[],
  bookId: string,
  sources: string,
  tab: string,
  tocUrl: string,
): Promise<BookChapter[]> {
  const serverUrl = resolveBookSourceServerUrl(source) ?? '';
  const chapters: BookChapter[] = [];

  for (let index = 0; index < rows.length; index++) {
    const row = normalizeCatalogRow(rows[index]!, sources, tab);
    const title = String(row.title ?? '').trim();

    if (rule?.chapterUrl?.trim()) {
      const chapter = await parseChapter(
        source,
        rule,
        {
          content: JSON.stringify(row),
          contentType: 'json',
          baseUrl: serverUrl || tocUrl,
          result: row,
          source: source as unknown as Record<string, unknown>,
          variables: { book_id: bookId },
        },
        tocUrl,
        index,
      );
      if (chapter) {
        chapters.push({ ...chapter, index: chapters.length });
      }
      continue;
    }

    const chapterPayload = {
      book_id: bookId,
      item_id: String(row.item_id ?? ''),
      title,
      sources: String(row.sources ?? ''),
      tab: String(row.tab ?? tab),
      url: String(row.toc_url ?? row.url ?? ''),
      ...(row.content_url
        ? { content_url: normalizeCatalogScalarField(row.content_url) }
        : {}),
    };
    chapters.push({
      url: buildTypedChapterDataUrl(chapterPayload),
      title: title || `章节 ${index + 1}`,
      isVolume: false,
      baseUrl: tocUrl,
      bookUrl: '',
      index: chapters.length,
      isVip: false,
      isPay: false,
      wordCount: undefined,
    });
  }

  return chapters;
}

async function fetchCatalogHtmlForPayload(
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
  // 对齐 Legado ruleToc.chapterList：仅 proxy=本地 时抓取原站目录页 HTML
  if (proxy !== '本地') return '';

  try {
    const headers = buildSourceRequestHeaders(source, pageUrl);
    return await get(pageUrl, {
      headers,
      enableCookieJar: source.enabledCookieJar,
      timeout: 30000,
    });
  } catch {
    return '';
  }
}

/** 规则 chapterList 失败时，按 data URL 载荷直连书源 /catalog（与规则内 java.ajax 同形） */
async function fetchCatalogChapterRows(
  source: BookSource,
  payload: Record<string, string>,
  bookVariable?: string,
): Promise<Record<string, unknown>[] | null> {
  const bookId = payload.book_id?.trim();
  if (!bookId) return null;

  const serverUrl = resolveBookSourceServerUrl(source);
  if (!serverUrl) return null;

  const sources = (payload.sources || payload.source || '').trim();
  if (!sources) {
    console.warn('[chapters] 目录 API 缺少 source/sources');
    return null;
  }
  const tab = (payload.tab || '小说').trim();
  const variable = buildCatalogApiVariable(bookVariable);
  const html = await fetchCatalogHtmlForPayload(source, payload);

  let lastFailure: { code: unknown; msg: string; book_id_len: number } | null = null;

  for (const candidateBookId of buildCatalogBookIdCandidates(bookId)) {
    const catalogQuery =
      `${serverUrl}/catalog?book_id=${encodeURIComponent(candidateBookId)}` +
      `&source=${encodeURIComponent(sources)}` +
      `&tab=${encodeURIComponent(tab)}` +
      `&variable=${encodeURIComponent(variable)}`;
    const ajaxArg = `${catalogQuery},${JSON.stringify({ method: 'POST', body: { html } })}`;
    const parsed = parseAjaxArgs(ajaxArg);
    if (!parsed?.urlStr) continue;

    const postBody = parsed.body ?? JSON.stringify({ html: '' });
    const headers = withJsonPostHeaders(
      buildBookSourceApiRequestHeaders(source, parsed.urlStr),
      postBody,
    );
    const responseText =
      parsed.method === 'POST'
        ? await post(parsed.urlStr, postBody, {
            headers,
            enableCookieJar: source.enabledCookieJar,
            timeout: 30000,
          })
        : await get(parsed.urlStr, {
            headers,
            enableCookieJar: source.enabledCookieJar,
            timeout: 30000,
          });
    await assertLoginCheckPassed(source, responseText, parsed.urlStr);

    let response: unknown;
    try {
      response = JSON.parse(responseText);
    } catch {
      console.warn('[chapters] 目录 API 响应非 JSON');
      continue;
    }

    const rows = extractCatalogChapterRows(response);
    if (rows) {
      if (candidateBookId !== bookId) {
        console.log('[chapters] catalog 使用备用 book_id 成功', {
          book_id_len: candidateBookId.length,
          chapters: rows.length,
        });
      }
      return rows;
    }

    const failure = readAggregationApiFailure(response);
    if (failure) {
      lastFailure = {
        ...failure,
        book_id_len: candidateBookId.length,
      };
    }
  }

  if (lastFailure) {
    console.warn('[chapters] 目录 API 返回异常:', lastFailure);
  } else {
    console.warn('[chapters] 目录 API 无章节数据');
  }
  return null;
}

/**
 * 打开章节前拉取最新 catalog item_id（内嵌上游 token 可能随目录缓存过期）
 */
export async function resolveFreshCatalogItemId(
  source: BookSource,
  payload: Record<string, string>,
  match: { title?: string; index?: number },
  bookVariable?: string,
): Promise<string | null> {
  const rows = await fetchCatalogChapterRows(source, payload, bookVariable);
  if (!rows?.length) return null;

  const title = match.title?.trim();
  if (title) {
    for (const row of rows) {
      if (String(row.title ?? '').trim() === title) {
        const id = normalizeCatalogScalarField(row.item_id).trim();
        if (id) return id;
      }
    }
  }

  const index = match.index ?? 0;
  if (index >= 0 && index < rows.length) {
    const id = normalizeCatalogScalarField(rows[index]!.item_id).trim();
    if (id) return id;
  }
  return null;
}

function parseCatalogRowsFromRuleScriptResult(
  scriptResult: unknown,
): Record<string, unknown>[] | null {
  if (scriptResult == null) return null;
  let root: unknown = scriptResult;
  if (typeof scriptResult === 'string') {
    const trimmed = scriptResult.trim();
    if (!trimmed.startsWith('{')) return null;
    try {
      root = JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }
  }
  return extractCatalogChapterRows(root);
}

/** 拆分 ruleToc.chapterList 的 `<js>...</js>` 与后续列表规则（如 `$.data`） */
function splitTocChapterListJsRule(chapterList: string): {
  jsCode: string;
  tailRule: string;
} | null {
  const trimmed = chapterList.trim();
  const open = trimmed.toLowerCase().indexOf('<js>');
  const close = trimmed.toLowerCase().indexOf('</js>');
  if (open !== 0 || close < 0) return null;
  const jsCode = trimmed.slice(4, close).trim();
  const tailRule = trimmed.slice(close + 5).trim();
  if (!jsCode) return null;
  return { jsCode, tailRule };
}

/** 规则目录异常：无 item_id 或全部章节 URL 相同（去重后只剩一条） */
function dataUrlTocChaptersLookSuspicious(chapters: BookChapter[]): boolean {
  if (chapters.length === 0) return false;
  const uniqueUrls = new Set(chapters.map((c) => c.url));
  if (chapters.length > 1 && uniqueUrls.size === 1) return true;

  let dataUrlCount = 0;
  let missingItemId = 0;
  for (const ch of chapters) {
    if (!ch.url.startsWith('data:')) continue;
    dataUrlCount += 1;
    const decoded = decodeDataUrl(ch.url);
    if (!decoded?.item_id?.trim()) missingItemId += 1;
  }
  if (dataUrlCount === 0) return false;
  if (chapters.length === 1 && missingItemId === 1) return true;
  if (dataUrlCount >= 3 && missingItemId === dataUrlCount) return true;
  return false;
}

/** chapterList 脚本若直接返回数组，尾规则 $.data 无效，改用 $[*] */
function resolveTocListTailRule(tailRule: string, listContext: RuleContext): string {
  const rule = (tailRule || '$.data').trim();
  const bare = rule.replace(/^@json:/i, '').trim();
  if (bare !== '$.data') return rule;
  if (Array.isArray(listContext.result)) return '$[*]';
  const content = String(listContext.content ?? '').trim();
  if (content.startsWith('[')) {
    try {
      if (Array.isArray(JSON.parse(content))) return '$[*]';
    } catch {
      /* ignore */
    }
  }
  return rule;
}

async function getChapterListFromDataUrlViaRule(
  source: BookSource,
  tocUrl: string,
  payload: Record<string, string>,
  options?: GetChapterListOptions,
): Promise<BookChapter[]> {
  const rule = source.ruleToc;
  if (!rule?.chapterList?.includes('<js>')) return [];

  const serverUrl = resolveBookSourceServerUrl(source) ?? '';
  const hexResult = jsonToHex(JSON.stringify(payload));
  const bookVariable = options?.bookVariable?.trim();
  const { listRule, reverse } = parseTocChapterListRule(rule.chapterList);
  const split = splitTocChapterListJsRule(listRule);
  if (!split) return [];

  const context: RuleContext = {
    content: hexResult,
    contentType: 'text',
    baseUrl: serverUrl,
    source: source as unknown as Record<string, unknown>,
    result: hexResult,
    book: bookVariable
      ? { type: 0, variable: bookVariable, custom: bookVariable }
      : { type: 0 },
    variables: {
      book_id: payload.book_id ?? '',
      tab: payload.tab ?? '',
      sources: payload.sources || payload.source || '',
    },
  };

  const scriptResult = await runLegadoRuleScript(
    split.jsCode,
    context as JsContext,
    source,
  );

  const scriptApiFailure = (() => {
    if (scriptResult == null) return null;
    if (typeof scriptResult === 'string') {
      const trimmed = scriptResult.trim();
      if (!trimmed.startsWith('{')) return null;
      try {
        return readAggregationApiFailure(JSON.parse(trimmed) as unknown);
      } catch {
        return null;
      }
    }
    return readAggregationApiFailure(scriptResult);
  })();
  if (scriptApiFailure) {
    console.warn('[chapters] chapterList 脚本 catalog 失败，跳过 $.data 回退:', scriptApiFailure);
    return [];
  }

  const catalogRowsFromScript = parseCatalogRowsFromRuleScriptResult(scriptResult);
  if (catalogRowsFromScript && catalogRowsFromScript.length > 0) {
    const bookId = (payload.book_id ?? '').trim();
    const sources = (payload.sources || payload.source || '').trim();
    const tab = (payload.tab || '小说').trim();
    console.log(
      '[chapters] chapterList 脚本返回 catalog，章节数:',
      catalogRowsFromScript.length,
    );
    const mapped = await mapCatalogRowsToChapters(
      source,
      rule,
      catalogRowsFromScript,
      bookId,
      sources,
      tab,
      tocUrl,
    );
    if (mapped.length > 0) {
      return applyFormatJs(
        source,
        rule,
        finalizeTocChapterOrder(mapped, reverse, options?.reverseToc === true),
        tocUrl,
      );
    }
  }

  let listContext: RuleContext = { ...context };
  if (Array.isArray(scriptResult)) {
    listContext = {
      ...listContext,
      result: scriptResult,
      content: JSON.stringify(scriptResult),
      contentType: 'json',
    };
  } else if (typeof scriptResult === 'string') {
    const trimmed = scriptResult.trim();
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      listContext = {
        ...listContext,
        result: parsed,
        content: trimmed,
        contentType: 'json',
      };
    } catch {
      listContext = { ...listContext, result: scriptResult, content: trimmed };
    }
  } else if (scriptResult != null) {
    listContext = {
      ...listContext,
      result: scriptResult,
      content: JSON.stringify(scriptResult),
      contentType: 'json',
    };
  }

  const tailRule = resolveTocListTailRule(split.tailRule || '$.data', listContext);
  const listItems = await analyzeListElements(tailRule, listContext);
  if (listItems.length === 0) return [];

  const bookId = String(
    listContext.variables?.book_id ?? context.variables?.book_id ?? payload.book_id ?? '',
  ).trim();

  const chapters: BookChapter[] = [];
  for (let i = 0; i < listItems.length; i++) {
    const item = listItems[i]!;
    const elementContext = enrichJsonListItemContext(
      item.content,
      detectContentType(item.content),
      tocUrl,
      source as unknown as Record<string, unknown>,
      { regexGroups: item.regexGroups },
    );
    elementContext.variables = {
      ...(listContext.variables ?? {}),
      book_id: bookId || payload.book_id,
    };
    const chapter = await parseChapter(source, rule, elementContext, tocUrl, i);
    if (chapter) chapters.push(chapter);
  }

  if (chapters.length === 0) return [];
  const ordered = finalizeTocChapterOrder(
    chapters,
    reverse,
    options?.reverseToc === true,
  );
  return await applyFormatJs(source, rule, ordered, tocUrl);
}

/**
 * 处理 data: URL 场景的章节列表获取
 * 优先直连 /catalog（与 Legado chapterList 脚本同形），失败再跑 ruleToc.chapterList。
 */
async function getChapterListFromDataUrl(
  source: BookSource,
  tocUrl: string,
  options?: GetChapterListOptions,
): Promise<BookChapter[]> {
  const decoded = decodeDataUrl(tocUrl);
  if (!decoded) {
    console.warn('[chapters] 无法解码 data URL');
    return [];
  }

  const payload = normalizeDataUrlPayload(decoded);

  const bookId = payload.book_id?.trim();
  if (!bookId) {
    console.warn('[chapters] data URL 中没有 book_id');
    return [];
  }

  // 对齐 Legado chapterList：核心是 POST /catalog；直连可避免 $.data 误解析 hex 载荷
  const rows = await fetchCatalogChapterRows(source, payload, options?.bookVariable);
  if (rows && rows.length > 0) {
    console.log('[chapters] catalog API 章节数:', rows.length);
    const sources = (payload.sources || payload.source || '').trim();
    const tab = (payload.tab || '小说').trim();
    return mapCatalogRowsToChapters(
      source,
      source.ruleToc,
      rows,
      bookId,
      sources,
      tab,
      tocUrl,
    );
  }

  try {
    const viaRule = await getChapterListFromDataUrlViaRule(
      source,
      tocUrl,
      payload,
      options,
    );
    if (viaRule.length > 0 && !dataUrlTocChaptersLookSuspicious(viaRule)) {
      console.log('[chapters] data URL 规则解析章节数:', viaRule.length);
      return viaRule;
    }
    if (viaRule.length > 0) {
      console.warn(
        '[chapters] data URL 规则目录异常（缺 item_id 或章节 URL 重复），catalog 直连亦失败',
      );
    }
  } catch (e) {
    console.warn('[chapters] data URL 规则解析失败:', e);
  }

  return [];
}

// ─── 标准 HTTP URL 场景 ───

/**
 * 获取章节列表
 * 自动检测 tocUrl 类型，选择对应的处理路径
 */
export async function getChapterList(
  source: BookSource,
  tocUrl: string,
  options?: GetChapterListOptions,
): Promise<BookChapter[]> {
  if (!source.ruleToc) {
    return [];
  }

  try {
    // ── data: URL 路径 ──
    if (tocUrl.startsWith('data:')) {
      return await getChapterListFromDataUrl(source, tocUrl, options);
    }

    // ── 标准 HTTP URL 路径 ──
    const rule = source.ruleToc;
    const { listRule: tocListRule, reverse: listRuleReverse } = parseTocChapterListRule(
      rule.chapterList,
    );
    const reverseToc = options?.reverseToc === true;
    const onPartial = options?.onPartial;

    /** 不 await：避免 DB/UI 回调阻塞后续分页请求（进入阅读器时卡顿的主因之一） */
    const emitPartial = (raw: BookChapter[], isComplete: boolean) => {
      if (!onPartial || raw.length === 0) return;
      void (async () => {
        let ordered = finalizeTocChapterOrder(raw, listRuleReverse, reverseToc);
        if (isComplete) {
          ordered = await applyFormatJs(source, rule, ordered, tocUrl);
        }
        ordered = ordered.map((chapter, index) => ({ ...chapter, index }));
        await onPartial({ chapters: ordered, isComplete });
      })();
    };

    const chapters: BookChapter[] = [];
    const seenChapterUrls = new Set<string>();
    const seenTocPages = new Set<string>();
    const pendingTocPages: string[] = [tocUrl];
    const tocSafety = getTocPaginationSafetyOptions();
    let safetyNotified = false;
    let nextTocUrlsResolved = false;
    const { fetchSourcePage } = await import('@/lib/book-source/fetch-source-page');

    while (pendingTocPages.length > 0) {
      if (tocSafety.enabled && seenTocPages.size >= tocSafety.maxPages) {
        const pendingPages = pendingTocPages.length;
        const truncatedPages = pendingPages;
        if (!safetyNotified) {
          safetyNotified = true;
          void notifyTocPaginationSafetyHit({
            sourceName: source.sourceName,
            maxPages: tocSafety.maxPages,
            tocUrl,
            truncatedPages,
            pendingPages,
          });
        }
        console.warn('[chapters] 目录分页达到安全阈值，停止继续抓取', {
          source: source.sourceName,
          maxPages: tocSafety.maxPages,
          seedTocUrl: tocUrl,
          pendingCount: pendingPages,
          truncatedPages,
        });
        break;
      }

      const currentTocUrl = pendingTocPages.shift()!;
      if (seenTocPages.has(currentTocUrl)) continue;
      seenTocPages.add(currentTocUrl);

      console.log('[chapters] 请求目录 URL:', currentTocUrl);
      const fetched = await fetchSourcePage({
        ruleUrl: currentTocUrl,
        source,
        baseUrl: source.sourceUrl,
      });
      const html = await applyPreUpdateJs(source, rule, fetched.body, currentTocUrl);
      const contentType = detectContentType(html);
      console.log(
        '[chapters] 目录 API 响应类型:',
        contentType,
        '长度:',
        html.length,
        '前100字符:',
        html.substring(0, 100),
      );

      // 处理 init 规则（如 "$.data"）：先导航到 JSON 子节点再应用其他规则
      let contextContent = html;
      if ((rule as unknown as { init?: string }).init && contentType === 'json') {
        try {
          const initResult = await analyzeString((rule as unknown as { init: string }).init, {
            content: html,
            contentType,
            baseUrl: currentTocUrl,
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
        baseUrl: currentTocUrl,
        source: source as unknown as Record<string, unknown>,
      };

      const pageChapters: BookChapter[] = [];

      if (tocListRule) {
        let chapterListRule = tocListRule;
        if (legadoListRuleNeedsAllSuffix(chapterListRule)) {
          chapterListRule = `${chapterListRule}@all`;
        }

        const listItems = await analyzeListElements(chapterListRule, context);
        console.log('[chapters] 提取到章节元素数:', listItems.length);

        for (const item of listItems) {
          const elementContext: RuleContext = {
            content: item.content,
            contentType: context.contentType,
            baseUrl: currentTocUrl,
            source: source as unknown as Record<string, unknown>,
            regexGroups: item.regexGroups,
            result: typeof item.rawValue === 'string' ? item.rawValue : item.content,
          };

          const chapter = await parseChapter(
            source,
            rule,
            elementContext,
            currentTocUrl,
            chapters.length,
          );
          if (chapter && !seenChapterUrls.has(chapter.url)) {
            seenChapterUrls.add(chapter.url);
            pageChapters.push(chapter);
          }
        }
      } else {
        const chapter = await parseChapter(source, rule, context, currentTocUrl, chapters.length);
        if (chapter && !seenChapterUrls.has(chapter.url)) {
          seenChapterUrls.add(chapter.url);
          pageChapters.push(chapter);
        }
      }

      chapters.push(...pageChapters);
      emitPartial(chapters, false);

      // Legado：nextTocUrl 仅在首屏目录解析一次（避免 baseUrl 为 6963_2.html 时拼出 6963_2.html2.html）
      if (rule.nextTocUrl?.trim() && !nextTocUrlsResolved) {
        nextTocUrlsResolved = true;
        try {
          const nextContext: RuleContext = {
            ...context,
            baseUrl: tocUrl,
          };
          const nextRawList = await analyzeStringList(rule.nextTocUrl, nextContext);
          const candidates = normalizeNextTocCandidates(nextRawList, tocUrl);
          for (const n of candidates) {
            if (!seenTocPages.has(n)) pendingTocPages.push(n);
          }
        } catch (e) {
          console.warn('[chapters] nextTocUrl 解析失败:', e);
        }
      }
    }

    let ordered = finalizeTocChapterOrder(chapters, listRuleReverse, reverseToc);
    ordered = await applyFormatJs(source, rule, ordered, tocUrl);
    ordered = ordered.map((chapter, index) => ({ ...chapter, index }));
    if (onPartial) {
      await onPartial({ chapters: ordered, isComplete: true });
    }
    return ordered;
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
    let title = rule.chapterName ? await analyzeString(rule.chapterName, context) : '';
    let url = rule.chapterUrl
      ? await analyzeString(rule.chapterUrl, context, { isUrl: true })
      : '';
    url = normalizeChapterDataUrl(url);

    if (!title && context.result && typeof context.result === 'object' && !Array.isArray(context.result)) {
      const row = context.result as Record<string, unknown>;
      const sourceLabel = String(row.source ?? row.sources ?? '').trim();
      const rowTitle = String(row.title ?? '').trim();
      if (sourceLabel || rowTitle) {
        title = sourceLabel && rowTitle ? `${sourceLabel}:${rowTitle}` : sourceLabel || rowTitle;
      }
    }

    // Legado 兼容容错：部分站点章节名规则在编码/替换后可能被清空，
    // 但章节 URL 已解析成功。此时回退到锚点文本，避免整章被丢弃。
    if (!title && url && context.contentType === 'html') {
      const escapedUrl = url.replace(/"/g, '\\"');
      const fallbackRules = [
        `a[href="${escapedUrl}"]@text`,
        `a[href="${escapedUrl}"]@ownText`,
        'a@text',
        'a@ownText',
        '@text',
      ];
      for (const r of fallbackRules) {
        const v = (await analyzeString(r, context)).trim();
        if (v) {
          title = v;
          break;
        }
      }
    }

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

function normalizeNextTocCandidates(rawList: string[], baseUrl: string): string[] {
  const out: string[] = [];
  const push = (v: string) => {
    const t = v.trim();
    if (!t || t === '#' || t.startsWith('javascript:')) return;
    const abs = resolveUrl(baseUrl, t);
    if (!abs || abs === baseUrl) return;
    out.push(abs);
  };

  for (const raw of rawList) {
    const t = raw.trim();
    if (!t) continue;

    if (t.startsWith('[') && t.endsWith(']')) {
      try {
        const arr = JSON.parse(t) as unknown[];
        if (Array.isArray(arr)) {
          for (const v of arr) {
            if (typeof v === 'string') push(v);
          }
          continue;
        }
      } catch {
        /* ignore */
      }
    }

    if (t.includes('\n')) {
      for (const line of t.split('\n')) push(line);
      continue;
    }

    if (t.includes(',') && /https?:\/\/|\.html/.test(t)) {
      for (const seg of t.split(',')) push(seg);
      continue;
    }

    push(t);
  }

  return Array.from(new Set(out));
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
