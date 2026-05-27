/**
 * 书源详情功能
 * 对应 legado 项目的 WebBook.getBookInfo + BookInfo.analyzeBookInfo
 *
 * 统一通过 ruleBookInfo 各字段规则解析；<js> 简介走 Legado QuickJS 环境。
 * data: URL 仅负责解码并请求 init 目标（与 Legado AnalyzeUrl 等价），不做书源专属拼装。
 */

import { get } from '@/lib/http';
import { analyzeString, type RuleContext } from '@/lib/rule-engine';
import type { BookSource } from '@/types';
import type { BookInfo } from '@/types';
import {
  buildSourceRequestHeaders,
  resolveAggregationServerUrl,
} from '@/lib/book-source/source-http';
import { resolveUrl, detectContentType, decodeDataUrl } from '@/lib/book-source/utils';
import { runBookInfoIntroScript } from '@/lib/book-source/book-info-script-runner';
import {
  buildIntroFromDetailJson,
  preferDetailField,
} from '@/lib/book-source/intro-merge';

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

  const context: RuleContext = {
    content: contextContent,
    contentType,
    baseUrl: bookUrl,
    source: source as unknown as Record<string, unknown>,
    result: ruleResult ? JSON.stringify(ruleResult) : contextContent,
  };

  const safeAnalyze = async (ruleText: string | undefined): Promise<string> => {
    if (!ruleText?.trim()) return '';
    try {
      return await analyzeString(ruleText, context);
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
    authorRawFromBaseRule.trim() ||
    authorFromRule.trim() ||
    (ruleResult?.author != null ? String(ruleResult.author) : '');
  const authorSplit = splitAuthorAndInlineTags(rawAuthor);
  const author = authorSplit.author;

  const intro = await resolveBookInfoIntro(source, rule.intro, context, {
    ruleResult,
    fetchUrl,
    bookUrl,
    durChapterTitle: options?.durChapterTitle,
  });

  let coverUrl: string | undefined;
  if (rule.coverUrl && !isJsRule(rule.coverUrl)) {
    const parsed = await safeAnalyze(rule.coverUrl);
    if (parsed.trim()) {
      coverUrl = resolveUrl(redirectUrl, parsed);
    }
  }
  if (!coverUrl && typeof ruleResult?.thumb_url === 'string') {
    coverUrl = ruleResult.thumb_url;
  }

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

  if (!name.trim()) {
    return null;
  }

  let tocUrl = bookUrl;
  if (rule.tocUrl && !isJsRule(rule.tocUrl)) {
    const parsedTocUrl = await safeAnalyze(rule.tocUrl);
    if (parsedTocUrl.trim()) {
      tocUrl = resolveUrl(bookUrl, parsedTocUrl);
    }
  }

  const tagsFromResult = typeof ruleResult?.tags === 'string' ? ruleResult.tags.trim() : '';
  const mergedInlineTags = authorSplit.inlineTags.join(' ');
  const mergedTags = [tagsFromResult, mergedInlineTags]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');

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

/**
 * data: URL：解码载荷并请求详情（等同 Legado ruleBookInfo.init 的服务器分支），
 * 再交给统一规则解析。
 */
async function getBookInfoFromDataUrl(
  source: BookSource,
  bookUrl: string,
  options?: { durChapterTitle?: string },
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

  const serverUrl = resolveAggregationServerUrl(source);
  if (!serverUrl) {
    console.warn('[detail] 无法从书源解析详情请求地址（jsLib server / 变量）');
    return null;
  }

  const sources = payload.sources || payload.source || '';
  const tab = payload.tab || '';
  const detailUrl = `${serverUrl}/detail?book_id=${encodeURIComponent(bookId)}&source=${encodeURIComponent(sources)}&tab=${encodeURIComponent(tab)}`;
  console.log('[detail] 请求详情 API:', detailUrl);

  const headers = buildSourceRequestHeaders(source, detailUrl);
  const responseText = await get(detailUrl, {
    headers,
    enableCookieJar: source.enabledCookieJar,
    timeout: 15000,
  });

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
  options?: { durChapterTitle?: string },
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

    return analyzeBookInfoFromBody(source, bookUrl, bookUrl, html, options);
  } catch (error) {
    console.error(`获取书籍详情失败 [${source.sourceName}]:`, error);
    return null;
  }
}
