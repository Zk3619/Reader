/**
 * 书源详情功能
 * 对应 legado 项目的 WebBook.getBookInfo + BookInfo.analyzeBookInfo
 *
 * 统一通过 ruleBookInfo 各字段规则解析；<js> 简介走 Legado QuickJS 环境。
 * data: URL 仅负责解码并请求 init 目标（与 Legado AnalyzeUrl 等价），不做书源专属拼装。
 */

import { get, post, HttpError } from '@/lib/http';
import { analyzeString, analyzeStringList, type RuleContext } from '@/lib/rule-engine';
import type { BookSource } from '@/types';
import type { BookInfo } from '@/types';
import {
  buildBookSourceApiRequestHeaders,
  buildSourceRequestHeaders,
  resolveBookSourceServerUrl,
} from '@/lib/book-source/source-http';
import {
  buildCatalogApiVariable,
  withJsonPostHeaders,
} from '@/lib/book-source/chapters';
import {
  getScriptBaseUrl,
  hostsFromJsLib,
} from '@/lib/js-engine/legado/source-script-shared';
import {
  resolveUrl,
  detectContentType,
  decodeDataUrl,
  resolveMediaUrl,
  buildQingtian2TocDataUrl,
} from '@/lib/book-source/utils';
import {
  runBookInfoIntroScript,
  runBookInfoTocUrlScript,
} from '@/lib/book-source/book-info-script-runner';
import {
  buildIntroFromDetailJson,
  preferDetailField,
} from '@/lib/book-source/intro-merge';
import { assertLoginCheckPassed } from '@/lib/book-source/login-check';

function isJsRule(rule: string | undefined | null): boolean {
  return !!rule?.trim().startsWith('<js>');
}

function splitAuthorAndInlineTags(rawAuthor: string): {
  author: string;
  inlineTags: string[];
} {
  const text = rawAuthor.trim();
  if (!text) return { author: '', inlineTags: [] };
  const parts = text.split('|').map((s) => s.trim()).filter(Boolean);
  const inlineTags: string[] = [];
  const authorParts: string[] = [];
  for (const p of parts) {
    if (/#/.test(p)) {
      const tags = p.split(/\s+/).map((x) => x.trim()).filter((x) => x.startsWith('#') && x.length > 1);
      if (tags.length > 0) {
        inlineTags.push(...tags);
        continue;
      }
    }
    authorParts.push(p);
  }
  return {
    author: (authorParts.join(' | ') || parts[0] || text).trim(),
    inlineTags: Array.from(new Set(inlineTags)),
  };
}

function normalizeAuthorText(author: string): string {
  const t = author.trim();
  if (!t) return '';
  // 常见站点详情格式："作者名 著"
  const m = t.match(/^(.+?)\s*著(?:\s|$)/);
  if (m?.[1]?.trim()) return m[1].trim();
  return t;
}

function normalizeTagText(tag: string): string {
  const t = tag.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.startsWith('#') ? t : `#${t}`;
}

function mergeTagStrings(...inputs: Array<string | undefined>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const input of inputs) {
    if (!input?.trim()) continue;
    for (const raw of input.split(/\s+/)) {
      const t = normalizeTagText(raw);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  return out.join(' ');
}

async function fallbackAuthorAndTagsFromHtml(context: RuleContext): Promise<{
  author?: string;
  tags?: string;
}> {
  if (context.contentType !== 'html') return {};

  const authorRules = [
    'p.gray a[href*="authorarticle"]@text',
    '.gray a[href*="authorarticle"]@text',
    'a[href*="authorarticle"]@text',
  ];
  for (const r of authorRules) {
    const v = normalizeAuthorText((await analyzeString(r, context)).trim());
    if (v) {
      const tags = await analyzeStringList('p.gray a[href*="tagarticle"]@text', context);
      const normalized = Array.from(
        new Set(tags.map(normalizeTagText).filter(Boolean)),
      ).join(' ');
      return { author: v, tags: normalized || undefined };
    }
  }

  const tags = await analyzeStringList('a[href*="tagarticle"]@text', context);
  const normalized = Array.from(
    new Set(tags.map(normalizeTagText).filter(Boolean)),
  ).join(' ');
  return { tags: normalized || undefined };
}

function getRuleBaseBeforeReplace(ruleText: string | undefined): string | undefined {
  if (!ruleText?.trim()) return undefined;
  const idx = ruleText.indexOf('##');
  if (idx < 0) return ruleText.trim();
  const base = ruleText.slice(0, idx).trim();
  return base || undefined;
}

/** 从详情页 JSON 文本解析供 <js> 使用的 result 对象 */
function parseRuleResultObject(body: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== 'object') return undefined;
    const obj = parsed as Record<string, unknown>;
    if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
      return obj.data as Record<string, unknown>;
    }
    return obj;
  } catch {
    return undefined;
  }
}

async function resolveBookInfoIntro(
  source: BookSource,
  rule: string | undefined,
  context: RuleContext,
  options: {
    ruleResult?: Record<string, unknown>;
    fetchUrl: string;
    bookUrl: string;
    durChapterTitle?: string;
  },
): Promise<string | undefined> {
  if (!rule?.trim()) {
    return options.ruleResult
      ? buildIntroFromDetailJson(options.ruleResult)
      : undefined;
  }

  if (isJsRule(rule)) {
    if (!options.ruleResult) {
      // HTML 详情页同样可能使用 <js> 规则，按通用规则引擎执行而不是强制 JSON。
      const parsed = (await analyzeString(rule, context)).trim();
      if (parsed) return parsed;
      console.warn('[detail] <js> 简介规则执行为空，已回退默认简介构建');
      return buildIntroFromDetailJson(parseRuleResultObject(context.content) ?? {});
    }
    const scripted = await runBookInfoIntroScript(
      source,
      options.ruleResult,
      options.fetchUrl,
      options.bookUrl,
      { durChapterTitle: options.durChapterTitle },
    );
    if (scripted?.trim()) return scripted;
    return buildIntroFromDetailJson(options.ruleResult);
  }

  const parsed = (await analyzeString(rule, context)).trim();
  if (parsed) return parsed;
  return options.ruleResult
    ? buildIntroFromDetailJson(options.ruleResult)
    : undefined;
}

/**
 * 对齐 BookInfo.analyzeBookInfo：对已有 body 应用 ruleBookInfo 各字段
 */
async function analyzeBookInfoFromBody(
  source: BookSource,
  bookUrl: string,
  redirectUrl: string,
  body: string,
  options?: {
    ruleResult?: Record<string, unknown>;
    fetchUrl?: string;
    durChapterTitle?: string;
  },
): Promise<BookInfo | null> {
  const rule = source.ruleBookInfo;
  if (!rule) return null;

  let contextContent = body;
  let contentType = detectContentType(body);

  if (rule.init?.trim() && !isJsRule(rule.init) && contentType === 'json') {
    try {
      const initResult = await analyzeString(rule.init, {
        content: body,
        contentType,
        baseUrl: bookUrl,
        source: source as unknown as Record<string, unknown>,
      });
      if (initResult) {
        contextContent = initResult;
        contentType = detectContentType(contextContent);
      }
    } catch (e) {
      console.warn('[detail] init 规则执行失败:', e);
    }
  }

  const ruleResult =
    options?.ruleResult ?? parseRuleResultObject(contextContent);
  const fetchUrl = options?.fetchUrl ?? redirectUrl;

  const sessionVariables: Record<string, unknown> = {};

  const context: RuleContext = {
    content: contextContent,
    contentType,
    baseUrl: bookUrl,
    source: source as unknown as Record<string, unknown>,
    result: ruleResult ? JSON.stringify(ruleResult) : contextContent,
    variables: sessionVariables,
  };

  const safeAnalyze = async (
    ruleText: string | undefined,
    options?: { isUrl?: boolean },
  ): Promise<string> => {
    if (!ruleText?.trim()) return '';
    try {
      return await analyzeString(ruleText, context, options);
    } catch (e) {
      console.warn('[detail] 字段规则解析失败，已跳过:', { rule: ruleText.slice(0, 80), error: e });
      return '';
    }
  };

  const nameFromRule = await safeAnalyze(rule.name);
  const name =
    nameFromRule.trim() ||
    (ruleResult?.book_name != null ? String(ruleResult.book_name) : '');
  const authorFromRule = await safeAnalyze(rule.author);
  const authorRawFromBaseRule = await safeAnalyze(getRuleBaseBeforeReplace(rule.author));
  const rawAuthor =
    authorFromRule.trim() ||
    authorRawFromBaseRule.trim() ||
    (ruleResult?.author != null ? String(ruleResult.author) : '');
  const authorSplit = splitAuthorAndInlineTags(rawAuthor);
  let author = normalizeAuthorText(authorSplit.author);

  // 字段顺序对齐 Legado BookInfo.analyzeBookInfo（wordCount 在 intro 之前，供 @get:{num}）
  const kindFromRule = await safeAnalyze(rule.kind);
  const kind =
    kindFromRule.trim() ||
    (typeof ruleResult?.category === 'string'
      ? ruleResult.category
      : typeof ruleResult?.tags === 'string'
        ? ruleResult.tags
        : undefined);

  const wordCountFromRule = await safeAnalyze(rule.wordCount);
  const wordCount =
    wordCountFromRule.trim() ||
    (ruleResult?.word_number != null ? String(ruleResult.word_number) : undefined);

  const latestFromRule = await safeAnalyze(rule.lastChapter);
  const latestChapterTitle =
    latestFromRule.trim() ||
    (typeof ruleResult?.last_chapter_title === 'string'
      ? ruleResult.last_chapter_title
      : undefined);

  const updateFromRule = await safeAnalyze(rule.updateTime);
  const latestChapterUpdateTime =
    updateFromRule.trim() ||
    (typeof ruleResult?.last_chapter_update_time === 'string'
      ? ruleResult.last_chapter_update_time
      : undefined);

  const intro = await resolveBookInfoIntro(source, rule.intro, context, {
    ruleResult,
    fetchUrl,
    bookUrl,
    durChapterTitle: options?.durChapterTitle,
  });

  let coverUrl: string | undefined;
  if (rule.coverUrl && !isJsRule(rule.coverUrl)) {
    coverUrl = resolveMediaUrl(redirectUrl, await safeAnalyze(rule.coverUrl, { isUrl: true }));
  }
  if (!coverUrl && typeof ruleResult?.thumb_url === 'string') {
    coverUrl = ruleResult.thumb_url;
  }

  if (!name.trim()) {
    return null;
  }

  let tocUrl = bookUrl;
  if (rule.tocUrl?.trim()) {
    if (ruleResult) {
      const qingtian2 = buildQingtian2TocDataUrl(ruleResult);
      if (qingtian2) {
        tocUrl = qingtian2;
      } else if (isJsRule(rule.tocUrl)) {
        const scripted = await runBookInfoTocUrlScript(
          source,
          ruleResult,
          fetchUrl,
          bookUrl,
        );
        if (scripted?.trim().startsWith('data:')) {
          tocUrl = scripted.trim();
        }
      }
    }
    if (tocUrl === bookUrl && rule.tocUrl && !isJsRule(rule.tocUrl)) {
      const parsedTocUrl = (await safeAnalyze(rule.tocUrl, { isUrl: true })).trim();
      if (parsedTocUrl) {
        tocUrl = resolveUrl(redirectUrl, parsedTocUrl);
      }
    }
    if (tocUrl !== bookUrl) {
      const tocPayload = decodeDataUrl(tocUrl);
      console.log('[detail] tocUrl 已更新为目录载荷', {
        type: tocUrl.includes('qingtian2') ? 'qingtian2' : 'other',
        hasTocPageUrl: Boolean(tocPayload?.url?.trim()),
        book_id_len: tocPayload?.book_id?.length ?? 0,
      });
    }
  }

  const tagsFromResult = typeof ruleResult?.tags === 'string' ? ruleResult.tags.trim() : '';
  const mergedInlineTags = authorSplit.inlineTags.join(' ');
  let mergedTags = [tagsFromResult, mergedInlineTags]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');

  // 仅在规则未命中时启用轻量兜底，避免书源特化清洗影响通用语义。
  if (!author || !mergedTags) {
    const htmlFallback = await fallbackAuthorAndTagsFromHtml(context);
    if (!author && htmlFallback.author) {
      author = htmlFallback.author;
    }
    if (!mergedTags && htmlFallback.tags) {
      mergedTags = mergeTagStrings(mergedTags, htmlFallback.tags);
    }
  }

  return {
    bookUrl,
    name: name.trim(),
    author: author.trim(),
    kind,
    intro,
    coverUrl: preferDetailField(coverUrl, undefined),
    wordCount,
    latestChapterTitle,
    latestChapterUpdateTime,
    tocUrl,
    origin: source.sourceUrl,
    originName: source.sourceName,
    source:
      typeof ruleResult?.source === 'string' ? ruleResult.source : undefined,
    status:
      typeof ruleResult?.status === 'string' ? ruleResult.status : undefined,
    tab: typeof ruleResult?.tab === 'string' ? ruleResult.tab : undefined,
    category:
      typeof ruleResult?.category === 'string'
        ? ruleResult.category
        : typeof ruleResult?.tags === 'string'
          ? ruleResult.tags
          : undefined,
    tags: mergedTags || undefined,
    score:
      ruleResult?.score != null ? String(ruleResult.score) : undefined,
  };
}

function listDetailApiServerCandidates(source: BookSource): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (url: string | null | undefined) => {
    const trimmed = (url ?? '').trim().replace(/\/+$/, '');
    if (!trimmed || !/^https?:\/\//i.test(trimmed) || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  };
  add(resolveBookSourceServerUrl(source));
  add(getScriptBaseUrl(source));
  const jsLib = (source as Record<string, unknown>).jsLib;
  for (const h of hostsFromJsLib(jsLib)) add(h);
  return out;
}

/** 对齐 ruleBookInfo.init：/detail?...&variable= + POST { html } */
function buildDetailApiUrl(
  serverUrl: string,
  bookId: string,
  sources: string,
  tab: string,
  bookVariable?: string,
): string {
  const base = serverUrl.replace(/\/+$/, '');
  const variable = encodeURIComponent(buildCatalogApiVariable(bookVariable));
  return (
    `${base}/detail?book_id=${encodeURIComponent(bookId)}` +
    `&source=${encodeURIComponent(sources)}` +
    `&tab=${encodeURIComponent(tab)}` +
    `&variable=${variable}`
  );
}

/**
 * data: URL：解码载荷并请求详情（等同 Legado ruleBookInfo.init 的服务器分支），
 * 再交给统一规则解析。
 */
async function getBookInfoFromDataUrl(
  source: BookSource,
  bookUrl: string,
  options?: { durChapterTitle?: string; bookVariable?: string },
): Promise<BookInfo | null> {
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

  const servers = listDetailApiServerCandidates(source);
  if (servers.length === 0) {
    console.warn('[detail] 无法从书源解析详情请求地址（jsLib server / 线路 / hosts）');
    return null;
  }

  const sources = payload.sources || payload.source || '';
  const tab = payload.tab || '';
  const detailBody = JSON.stringify({ html: '' });
  const requestCommon = {
    enableCookieJar: source.enabledCookieJar,
    timeout: 15000,
  };

  let detailUrl = '';
  let responseText = '';
  let lastError: unknown;

  for (const serverUrl of servers) {
    detailUrl = buildDetailApiUrl(serverUrl, bookId, sources, tab, options?.bookVariable);
    console.log('[detail] 请求详情 API:', detailUrl);
    const headers = withJsonPostHeaders(
      buildBookSourceApiRequestHeaders(source, detailUrl),
      detailBody,
    );
    try {
      responseText = await post(detailUrl, detailBody, { headers, ...requestCommon });
      lastError = undefined;
      break;
    } catch (e) {
      lastError = e;
      const retryable =
        e instanceof HttpError && (e.status === 502 || e.status === 503 || e.status === 504);
      if (retryable && servers.indexOf(serverUrl) < servers.length - 1) {
        console.warn('[detail] 详情 API 网关错误，尝试下一条线路', {
          status: e.status,
          server: serverUrl,
        });
        continue;
      }
      throw e;
    }
  }

  if (lastError) throw lastError;

  await assertLoginCheckPassed(source, responseText, detailUrl);

  let response: { code?: number; data?: unknown; msg?: string };
  try {
    response = JSON.parse(responseText);
  } catch {
    console.warn('[detail] 详情 API 响应非 JSON');
    return null;
  }

  if (response.code !== 0 || !response.data) {
    console.warn('[detail] 详情 API 返回异常:', response.msg || response);
    return null;
  }

  const d = response.data as Record<string, unknown>;
  console.log('[detail] 详情 API 响应:', {
    book_name: d.book_name,
    author: d.author,
    hasAbstract: !!d.abstract,
    hasLastChapter: !!d.last_chapter_title,
    source: d.source,
  });

  return analyzeBookInfoFromBody(source, bookUrl, detailUrl, JSON.stringify(d), {
    ruleResult: d,
    fetchUrl: detailUrl,
    durChapterTitle: options?.durChapterTitle,
  });
}

/**
 * 获取书籍详情
 */
export async function getBookInfo(
  source: BookSource,
  bookUrl: string,
  options?: { durChapterTitle?: string; bookVariable?: string },
): Promise<BookInfo | null> {
  if (!source.ruleBookInfo) {
    return null;
  }

  try {
    if (bookUrl.startsWith('data:')) {
      return await getBookInfoFromDataUrl(source, bookUrl, options);
    }

    const headers = buildSourceRequestHeaders(source, bookUrl);
    const html = await get(bookUrl, {
      headers,
      enableCookieJar: source.enabledCookieJar,
      concurrentRate: source.concurrentRate,
      timeout: 30000,
    });
    await assertLoginCheckPassed(source, html, bookUrl);

    return analyzeBookInfoFromBody(source, bookUrl, bookUrl, html, options);
  } catch (error) {
    console.error(`获取书籍详情失败 [${source.sourceName}]:`, error);
    return null;
  }
}
