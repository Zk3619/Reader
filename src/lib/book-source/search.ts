/**
 * 书源搜索功能
 * 对应 legado 项目的 WebBook.searchBook
 */

import { get, request, HttpError } from '@/lib/http';
import { fetchByAnalyzeUrl } from '@/lib/book-source/analyze-url';
import {
  analyzeListElements,
  analyzeRule,
  analyzeString,
  type RuleContext,
} from '@/lib/rule-engine';
import { legadoListRuleNeedsAllSuffix } from '@/lib/rule-engine/legado-source-rule';
import {
  isLikelySerializedBookDetailJson,
  sanitizeSearchIntro,
} from '@/lib/book-source/intro-merge';
import type { BookSource, SearchRule } from '@/types';
import type { SearchBook } from '@/types';
import { resolveSearchRequest } from '@/lib/book-source/analyze-search-url';
import {
  alignUrlToBookSourceRequestOrigin,
  buildSourceRequestHeaders,
  resolveBookSourceRequestOrigin,
  resolveSourceCookiesForHttp,
} from '@/lib/book-source/source-http';
import { resolveExploreAuthor } from '@/lib/book-source/explore';
import {
  detectContentType,
  isLegadoTypedDataUrl,
  legadoDataUrlRuleBody,
  resolveMediaUrl,
  resolveUrl,
} from '@/lib/book-source/utils';
import { resolveBookType } from '@/lib/book-source/book-type';
import { assertLoginCheckPassed } from '@/lib/book-source/login-check';
import { resolveCheckKeyword } from '@/lib/book-source/search-keyword';
import {
  fetchPostHtmlViaCfWebView,
  shouldUseCfWebViewFetch,
} from '@/lib/book-source/cf-webview-fetch';
import {
  isCloudflareBlockedResponse,
  resolveCloudflareViaInnerWeb,
  shouldOfferCloudflareVerification,
} from '@/lib/http/cloudflare-verification';
import { enrichJsonListItemContext, parseJsonListItemRecord } from '@/lib/book-source/json-list-context';
import {
  COVER_JSON_PATHS,
  pickFirstJsonField,
} from '@/lib/book-source/explore-json-fields';
import {
  buildPreciseSearchFilter,
  formatWordCountLikeLegado,
  normalizeAuthorText,
  normalizeBookNameText,
  shouldFallbackToDetailParsing,
} from '@/lib/book-source/search-format';
import {
  createScriptNoticeBus,
  parseRateLimitMessageFromHtml,
} from '@/lib/book-source/rate-limit-guard';

export const parseSearchThrottleAlertMessage = parseRateLimitMessageFromHtml;

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

/** 对齐 Legado getStringList(ruleKind).joinToString(",")，并剔除误当列表解析的 JSON 片段 */
function isLikelyHtmlBlobKind(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith('<')) return false;
  return /<div\b|<body\b|class=["']c_row/i.test(t);
}

function isLikelyIntroSentence(token: string): boolean {
  const t = token.trim();
  return (
    t.length > 36 ||
    /[。！？；…]/.test(t) ||
    /^(半夜|手机|我将|苏易|恭喜|一次|他帮了|外卖|相机)/.test(t)
  );
}

function isLikelyKindTagToken(token: string): boolean {
  const t = token.trim();
  if (!t) return false;
  if (isLikelyAuthorIdToken(t)) return false;
  if (/^#/.test(t)) return true;
  if (/^(NTL|NPH|AI生成|后宫|母子|制服|熟女|恋足)$/i.test(t)) return true;
  if (t.length <= 16 && !/[。！？；…]/.test(t) && !isLikelyIntroSentence(t)) return true;
  return false;
}

function normalizeKindFromRule(
  raw: string | undefined,
  opts?: { bookName?: string; searchKey?: string },
): string | undefined {
  if (!raw?.trim()) return undefined;
  let text = raw.trim();
  if (isLikelyHtmlBlobKind(text)) return undefined;
  const bodyMatch = /^<body[^>]*>([\s\S]*)<\/body>$/i.exec(text);
  if (bodyMatch?.[1]) {
    text = bodyMatch[1].trim();
    if (isLikelyHtmlBlobKind(text)) return undefined;
  }
  if (isLikelySerializedBookDetailJson(text)) {
    return undefined;
  }
  const firstLine = text.split('\n').map((s) => s.trim()).find(Boolean);
  if (!firstLine) return undefined;
  text = firstLine;
  const bookName = opts?.bookName?.trim();
  const searchKey = opts?.searchKey?.trim();
  const hasHashTags = /#\s*[^\s#,，]+/.test(text);
  const tokens = text
    .split(/[\n,，|｜\s]+/g)
    .map((s) => (stripHtml(s) ?? '').trim().replace(/^#+/, ''))
    .filter(
      (s) =>
        s &&
        !isLikelySerializedBookDetailJson(s) &&
        !(s.startsWith('{') && /"book_name"|"book_id"|"thumb_url"/.test(s)) &&
        !isLikelyIntroSentence(s) &&
        (!bookName || s !== bookName) &&
        (!searchKey || s !== searchKey) &&
        (!bookName || s.length > 12 || !bookName.includes(s)) &&
        (!hasHashTags || isLikelyKindTagToken(s)),
    );
  return tokens.length > 0 ? Array.from(new Set(tokens)).join(',') : undefined;
}

function logSearchFieldDebug(
  sourceName: string,
  bookIndex: number,
  field: string,
  rule: string,
  context: RuleContext,
  replaced: string,
  applied: string,
): void {
  const rawPreview = context.content.slice(0, 220).replace(/\s+/g, ' ').trim();
  console.log(
    `[search:field-debug] source=${sourceName} book#${bookIndex + 1} field=${field}\n` +
      `rule=${rule}\n` +
      `raw=${rawPreview}\n` +
      `applied=${applied}\n` +
      `replaced=${replaced}`,
  );
}

async function analyzeLegadoStringField(
  rule: string,
  context: RuleContext,
  joiner = '\n',
  options?: { isUrl?: boolean },
): Promise<string> {
  if (options?.isUrl) {
    return (await analyzeString(rule, context, { isUrl: true })).trim();
  }
  const results = await analyzeRule(rule, context);
  if (results.length === 0) return '';
  if (results.length === 1) return results[0] ?? '';
  return results.filter((r) => r.trim()).join(joiner);
}

/** 对齐 Legado BookList：getStringList(ruleKind)?.joinToString(",") */
export async function analyzeKindField(
  rule: string | undefined,
  context: RuleContext,
  opts?: { bookName?: string; searchKey?: string },
): Promise<string> {
  if (!rule?.trim()) return '';
  const results = await analyzeRule(rule, context);
  // Legado BookList/BookInfo: getStringList(kind)?.joinToString(",")
  return normalizeKindFromRule(results.filter((r) => r.trim()).join(','), opts) ?? '';
}

async function analyzeFieldWithDebug(
  field: string,
  rule: string | undefined,
  context: RuleContext,
  sourceName: string,
  debugBookIndex: number | null,
  joiner = '\n',
  options?: { isUrl?: boolean },
): Promise<string> {
  if (!rule?.trim()) return '';
  const replaced = await analyzeLegadoStringField(rule, context, joiner, options);
  if (debugBookIndex != null && typeof window !== 'undefined') {
    logSearchFieldDebug(sourceName, debugBookIndex, field, rule, context, replaced, replaced);
  }
  return replaced;
}

export function parseGrayMetaFromTextNodes(raw: string): {
  author?: string;
  tags?: string;
  intro?: string;
} {
  const lines = raw
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
  if (lines.length === 0) return {};
  const first = lines[0] ?? '';
  const second = lines.slice(1).join('\n').trim();
  const author = first.replace(/\s*[|｜].*$/u, '').trim();
  const tagMatches = first.match(/#[^#\s,，|｜]+/g) ?? [];
  const tags =
    tagMatches.length > 0 ? Array.from(new Set(tagMatches)).join(' ') : undefined;
  return {
    author: author || undefined,
    tags,
    intro: second || undefined,
  };
}

function isLikelyAuthorIdToken(token: string): boolean {
  const t = token.trim();
  return /^\d+[\s（(]/.test(t) || /^[\d（()）\s]{4,}$/u.test(t);
}

function isLikelyCorruptSearchIntro(intro: string | undefined): boolean {
  const t = intro?.trim() ?? '';
  if (!t) return false;
  if (/[|｜]/.test(t) && /#/.test(t)) return true;
  if (/^[^（(]*[)）]\s*[|｜]/.test(t)) return true;
  return false;
}

function pickSearchAuthor(ruleAuthor: string, grayAuthor?: string): string {
  const r = normalizeAuthorText(stripHtml(ruleAuthor) ?? '');
  const g = normalizeAuthorText(grayAuthor ?? '');
  if (!g) return r;
  if (!r) return g;
  if (g.includes(r) || r.includes(g)) return g.length >= r.length ? g : r;
  return r;
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
  let grayMeta: ReturnType<typeof parseGrayMetaFromTextNodes> = {};
  const jsonRow = parseJsonListItemRecord(context.content);
  const isJsonItem = context.contentType === 'json' || jsonRow != null;
  if (!isJsonItem) {
    const grayTextNodes = await pickFirstValue(
      ['p.gray@textNodes', '//p[@class="gray"]@textNodes', '.gray@textNodes'],
      context,
    );
    grayMeta = parseGrayMetaFromTextNodes(grayTextNodes);
  }

  if (!coverUrl?.trim() && isJsonItem) {
    const jsonContext =
      jsonRow && context.contentType !== 'json'
        ? { ...context, contentType: 'json' as const, book: jsonRow, result: jsonRow }
        : context;
    coverUrl = await pickFirstJsonField(jsonContext, COVER_JSON_PATHS);
  }

  if (!coverUrl?.trim() && context.contentType === 'html' && !jsonRow) {
    coverUrl = await pickFirstValue(
      [
        'img@src',
        'img@data-src',
        'img@data-original',
      ],
      context,
    );
  }

  const ruleIntro = isLikelyCorruptSearchIntro(intro) ? undefined : intro;
  const ruleKind = normalizeKindFromRule(stripHtml(kind ?? undefined));
  const grayKind = grayMeta.tags?.includes('#')
    ? grayMeta.tags.trim()
    : normalizeKindFromRule(grayMeta.tags);
  return {
    author: pickSearchAuthor(author, grayMeta.author),
    intro:
      formatIntroText(ruleIntro ?? undefined) ||
      formatIntroText(grayMeta.intro ?? undefined),
    coverUrl,
    kind: ruleKind || grayKind || undefined,
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
    /** 源内解析阶段过滤（含 intro 供扩展搜索） */
    filter?: (name: string, author: string, kind?: string, intro?: string) => boolean;
    /** 对齐 Legado SearchModel.shouldBreak：满足条件提前停止 */
    shouldBreak?: (size: number) => boolean;
  },
  page = 1,
): Promise<SearchBook[]> {
  const noticeBus = createScriptNoticeBus(source.sourceName, '搜索');
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

    const resolved = await resolveSearchRequest(source, requestKeyword, page, {
      onScriptToast: noticeBus.onScriptToast,
    });
    const typedDataSearchUrl = resolved.ruleUrlWithOption;
    const isTypedDataSearch = isLegadoTypedDataUrl(typedDataSearchUrl);
    let searchUrl = alignUrlToBookSourceRequestOrigin(resolved.url, source);
    const searchRuleBaseUrl =
      (isTypedDataSearch
        ? resolveBookSourceRequestOrigin(source) || source.sourceUrl
        : searchUrl) || searchUrl;
    const { method, headers: urlOptionHeaders, body, charset: responseCharset } = resolved;

    const buildHttpHeaders = () => {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(urlOptionHeaders)) {
        const key = k.trim();
        if (!key || key.includes('{{') || key.includes('}}') || key.includes('@')) continue;
        if (String(v).includes('{{') || String(v).includes('}}')) continue;
        headers[key] = String(v);
      }
      const fromStore = buildSourceRequestHeaders(source, searchUrl);
      return { ...fromStore, ...headers };
    };

    const fetchSearchHtml = async (): Promise<string> => {
      if (isTypedDataSearch) {
        const hex = legadoDataUrlRuleBody(typedDataSearchUrl);
        if (hex != null) {
          await assertLoginCheckPassed(source, hex, searchRuleBaseUrl);
          return hex;
        }
      }
      const headers = buildHttpHeaders();
      const storedCookie = resolveSourceCookiesForHttp(source, searchUrl).trim();
      if (storedCookie) {
        const existing = (headers.Cookie ?? headers.cookie ?? '').trim();
        headers.Cookie = existing
          ? `${storedCookie}; ${existing}`
          : storedCookie;
        delete headers.cookie;
      }
      const cookieForCf = (headers.Cookie ?? storedCookie).trim();
      if (resolved.useWebView || resolved.webJs) {
        const fetched = await fetchByAnalyzeUrl({
          ruleUrl: resolved.ruleUrlWithOption.replace(resolved.url, searchUrl),
          source,
          keyword: requestKeyword,
          page,
          baseUrl: searchUrl,
          cookies: storedCookie,
          defaultWebViewDelayMs: resolved.webViewDelayMs,
          scriptNotice: noticeBus,
        });
        await assertLoginCheckPassed(source, fetched.body, fetched.url || searchUrl);
        return fetched.body;
      }
      /** 已有 cf_clearance：与发现页一致，走 WebView fetch，避免 plugin-http 403 与反复弹 CF 页 */
      if (shouldUseCfWebViewFetch(source, cookieForCf)) {
        if (method === 'POST') {
          const html = await fetchPostHtmlViaCfWebView(
            source,
            searchUrl,
            body ?? '',
            headers,
            cookieForCf,
            responseCharset,
          );
          await assertLoginCheckPassed(source, html, searchUrl);
          return html;
        }
      }
      const httpOpts = {
        headers,
        enableCookieJar: source.enabledCookieJar,
        concurrentRate: source.concurrentRate,
        timeout: 30000,
      };
      const html =
        method === 'POST'
          ? await (async () => {
              const res = await request(searchUrl, {
                ...httpOpts,
                method: 'POST',
                body: body ?? '',
              });
              const { decodeBookSourceResponseBytes } = await import(
                '@/lib/book-source/response-charset'
              );
              return decodeBookSourceResponseBytes(
                await res.arrayBuffer(),
                responseCharset,
              );
            })()
          : await get(searchUrl, httpOpts);
      await assertLoginCheckPassed(source, html, searchUrl);
      return html;
    };

    const openCfPanelAndRetry = async (): Promise<string> => {
      const verified = await resolveCloudflareViaInnerWeb({
        url: searchUrl,
        source,
      });
      if (!verified) {
        throw new HttpError(403, 'Forbidden', searchUrl, 'Cloudflare 验证未完成');
      }
      searchUrl = alignUrlToBookSourceRequestOrigin(searchUrl, source);
      return fetchSearchHtml();
    };

    let html: string;
    try {
      html = await fetchSearchHtml();
      if (isCloudflareBlockedResponse(200, html)) {
        html = await openCfPanelAndRetry();
      }
    } catch (e) {
      if (!shouldOfferCloudflareVerification(e)) throw e;
      if (source.enabledCookieJar) {
        try {
          html = await fetchSearchHtml();
          if (isCloudflareBlockedResponse(200, html)) {
            html = await openCfPanelAndRetry();
          }
        } catch (retryErr) {
          if (!shouldOfferCloudflareVerification(retryErr)) throw retryErr;
          html = await openCfPanelAndRetry();
        }
      } else {
        html = await openCfPanelAndRetry();
      }
    }

    const contentType = detectContentType(html);
    const respondTime = Date.now() - startTime;
    if (contentType === 'html') {
      const notice = noticeBus.consumeHtmlNotice(html);
      if (notice && noticeBus.shouldBlockOnNotice(notice)) {
        console.warn(`[search] 命中搜索频率限制 [${source.sourceName}]`, {
          url: searchUrl.slice(0, 120),
          throttleMessage: notice.message,
        });
        return [];
      }
    }

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
      baseUrl: isTypedDataSearch ? searchRuleBaseUrl : searchUrl,
      source: source as unknown as Record<string, unknown>,
      onScriptToast: noticeBus.onScriptToast,
    };

    // 检查是否是详情页（bookUrlPattern匹配）
    if (source.bookUrlPattern) {
      try {
        const pattern = new RegExp(source.bookUrlPattern);
        if (pattern.test(searchUrl)) {
          // 这是详情页，直接解析为单个搜索结果
          const book = await parseBookInfoFromDetail(source, rule, html, searchUrl, context, 0);
          if (book && options?.filter?.(book.name, book.author, book.kind, book.intro) !== false) {
            return [book];
          }
        }
      } catch {
        // 正则表达式无效，忽略
      }
    }

    // 解析书籍列表
    const bookList: SearchBook[] = [];
    const maxDebugBooks = 3;

    if (rule.bookList) {
      // 获取书籍列表元素
      // 如果规则没有提取器（如 "li"），添加 @all 提取器以获取完整HTML元素
      // 这样后续的子规则（如 ".novelname@text"）可以在完整的元素HTML上应用
      let listRule = parsedBookListRule || rawBookListRule;
      if (legadoListRuleNeedsAllSuffix(listRule)) {
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
        if (shouldFallbackToDetailParsing(source.bookUrlPattern)) {
          const detailBook = await parseSearchBook(
            source,
            rule,
            context,
            searchUrl,
            respondTime,
            0,
            requestKeyword,
          );
          if (
            detailBook &&
            options?.filter?.(detailBook.name, detailBook.author, detailBook.kind, detailBook.intro) !== false
          ) {
            return [detailBook];
          }
        }
      }

      for (let listIndex = 0; listIndex < listItems.length; listIndex++) {
        const item = listItems[listIndex]!;
        const element = item.content;
        const debugBookIndex = listIndex < maxDebugBooks ? listIndex : null;
        // 保持列表根上下文的内容类型，避免片段重判导致字段串位。
        const elementContext = enrichJsonListItemContext(
          element,
          context.contentType ?? 'html',
          searchUrl,
          source as unknown as Record<string, unknown>,
          { regexGroups: item.regexGroups },
        );
        elementContext.onScriptToast = noticeBus.onScriptToast;

        const book = await parseSearchBook(
          source,
          rule,
          elementContext,
          searchUrl,
          respondTime,
          debugBookIndex,
          requestKeyword,
        );
        if (book && options?.filter?.(book.name, book.author, book.kind, book.intro) !== false) {
          bookList.push(book);
          if (options?.shouldBreak?.(bookList.length) === true) {
            break;
          }
        }
      }
    } else {
      // 如果没有bookList规则，尝试直接解析单个书籍
      const book = await parseSearchBook(
        source,
        rule,
        context,
        searchUrl,
        respondTime,
        0,
        requestKeyword,
      );
      if (book && options?.filter?.(book.name, book.author, book.kind, book.intro) !== false) {
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
 * 对齐 Legado WebBook.preciseSearchAwait（单书源）
 * - 关键词只用书名 name
 * - 源内过滤 name + author 全等
 * - 命中后 shouldBreak(size > 0) 提前结束
 */
export async function preciseSearchBook(
  source: BookSource,
  name: string,
  author: string,
): Promise<SearchBook | null> {
  const normalizedName = normalizeBookNameText(name);
  const list = await searchBook(
    source,
    normalizedName || name,
    {
      filter: buildPreciseSearchFilter(name, author),
      shouldBreak: (size) => size > 0,
    },
    1,
  );
  return list[0] ?? null;
}


/**
 * 从详情页解析书籍信息
 */
async function parseBookInfoFromDetail(
  source: BookSource,
  rule: SearchRule,
  _html: string,
  url: string,
  context: RuleContext,
  debugBookIndex: number | null = 0,
): Promise<SearchBook | null> {
  try {
    const name = await analyzeFieldWithDebug('name', rule.name, context, source.sourceName, debugBookIndex);
    const author = await analyzeFieldWithDebug('author', rule.author, context, source.sourceName, debugBookIndex);
    const intro =
      sanitizeSearchIntro(
        await analyzeFieldWithDebug('intro', rule.intro, context, source.sourceName, debugBookIndex),
      ) || undefined;
    let coverUrl =
      (await analyzeFieldWithDebug(
        'coverUrl',
        rule.coverUrl,
        context,
        source.sourceName,
        debugBookIndex,
        '\n',
        { isUrl: true },
      )) || undefined;
    const latestChapterTitle = await analyzeFieldWithDebug(
      'lastChapter',
      rule.lastChapter,
      context,
      source.sourceName,
      debugBookIndex,
    ) || undefined;
    const latestChapterUpdateTime = await analyzeFieldWithDebug(
      'updateTime',
      rule.updateTime,
      context,
      source.sourceName,
      debugBookIndex,
    ) || undefined;

    const normalizedName = normalizeBookNameText(stripHtml(name) ?? '');
    if (!normalizedName) {
      return null;
    }

    // 解析bookUrl（通常是当前URL或从规则中获取）
    let bookUrl = url;
    if (rule.bookUrl) {
      const parsedBookUrl = await analyzeFieldWithDebug('bookUrl', rule.bookUrl, context, source.sourceName, debugBookIndex);
      if (parsedBookUrl) {
        bookUrl = resolveUrl(url, parsedBookUrl);
      }
    }

    const kindOpts = { bookName: normalizedName };
    let kind = rule.kind
      ? normalizeKindFromRule(await analyzeKindField(rule.kind, context, kindOpts), kindOpts)
      : undefined;
    if (debugBookIndex != null && typeof window !== 'undefined' && rule.kind) {
      const kindRaw = await analyzeRule(rule.kind, context);
      logSearchFieldDebug(
        source.sourceName,
        debugBookIndex,
        'kind',
        rule.kind,
        context,
        kind ?? '',
        `raw=[${kindRaw.length}] ${kindRaw.join(' | ')}`,
      );
    }
    if (!kind?.trim() && context.contentType === 'json') {
      kind = normalizeKindFromRule(
        await pickFirstValue(
          ['$.category', '$.status', '$.tags', '$.score'],
          context,
        ),
        kindOpts,
      );
    }

    return {
      bookUrl,
      name: normalizedName,
      author: author || '',
      kind,
      intro,
      coverUrl: resolveMediaUrl(url, coverUrl),
      latestChapterTitle,
      latestChapterUpdateTime,
      tocUrl: bookUrl, // 详情页通常也是目录页
      origin: source.sourceUrl,
      originName: source.sourceName,
      type: resolveBookType(source.sourceType),
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
  respondTime: number,
  debugBookIndex: number | null = null,
  searchKey = '',
): Promise<SearchBook | null> {
  try {
    const name = await analyzeFieldWithDebug('name', rule.name, context, source.sourceName, debugBookIndex);
    const normalizedName = normalizeBookNameText(stripHtml(name) ?? '');
    let author = rule.author
      ? await resolveExploreAuthor(rule.author, context)
      : '';
    if (debugBookIndex != null && typeof window !== 'undefined' && rule.author) {
      logSearchFieldDebug(
        source.sourceName,
        debugBookIndex,
        'author',
        rule.author,
        context,
        author,
        author,
      );
    }
    let bookUrl = await analyzeFieldWithDebug('bookUrl', rule.bookUrl, context, source.sourceName, debugBookIndex);

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
    let intro =
      sanitizeSearchIntro(
        await analyzeFieldWithDebug('intro', rule.intro, context, source.sourceName, debugBookIndex),
      ) || undefined;
    let coverUrl =
      (await analyzeFieldWithDebug(
        'coverUrl',
        rule.coverUrl,
        context,
        source.sourceName,
        debugBookIndex,
        '\n',
        { isUrl: true },
      )) || undefined;
    let latestChapterTitle = await analyzeFieldWithDebug(
      'lastChapter',
      rule.lastChapter,
      context,
      source.sourceName,
      debugBookIndex,
    ) || undefined;
    const latestChapterUpdateTime = await analyzeFieldWithDebug(
      'updateTime',
      rule.updateTime,
      context,
      source.sourceName,
      debugBookIndex,
    ) || undefined;
    const kindOpts = { bookName: normalizedName, searchKey: searchKey.trim() || undefined };
    let kind = rule.kind
      ? normalizeKindFromRule(await analyzeKindField(rule.kind, context, kindOpts), kindOpts)
      : undefined;
    if (debugBookIndex != null && typeof window !== 'undefined' && rule.kind) {
      const kindRaw = await analyzeRule(rule.kind, context);
      logSearchFieldDebug(
        source.sourceName,
        debugBookIndex,
        'kind',
        rule.kind,
        context,
        kind ?? '',
        `raw=[${kindRaw.length}] ${kindRaw.join(' | ')}`,
      );
    }
    if (!kind?.trim() && context.contentType === 'json') {
      kind = normalizeKindFromRule(
        await pickFirstValue(
          ['$.category', '$.status', '$.tags', '$.score'],
          context,
        ),
        kindOpts,
      );
    }
    const wordCountRaw = await analyzeFieldWithDebug('wordCount', rule.wordCount, context, source.sourceName, debugBookIndex) || undefined;

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
    const wordCount = formatWordCountLikeLegado(wordCountRaw);
    if (wordCountRaw) {
      chapterWordCountText = wordCount ?? wordCountRaw;
      // 尝试提取数字
      const match = wordCountRaw.match(/(\d+(?:\.\d+)?)\s*(?:万|w|k|千)?/i);
      if (match) {
        let num = parseFloat(match[1]);
        if (/万|w/i.test(wordCountRaw)) {
          num *= 10000;
        } else if (/k|千/i.test(wordCountRaw)) {
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
      coverUrl: resolveMediaUrl(baseUrl, coverUrl),
      latestChapterTitle,
      latestChapterUpdateTime,
      tocUrl,
      origin: source.sourceUrl,
      originName: source.sourceName,
      type: resolveBookType(source.sourceType),
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
