/**
 * 书源校验
 * 参考 Legado：对书源执行搜索/发现/目录/正文检查，并返回可展示的结果类型
 */

import { HttpError } from '@/lib/http';
import { getBookSourcePage } from '@/lib/book-source/source-http-cf';
import { buildUrl, parseHeaders } from '@/lib/book-source/utils';
import { searchBook } from '@/lib/book-source/search';
import { exploreBook } from '@/lib/book-source/explore';
import { getChapterList } from '@/lib/book-source/chapters';
import { getContent } from '@/lib/book-source/content';
import { getExploreSections, getExploreSectionsAsync, isExploreUrlScript } from '@/lib/book-source/explore-sections';
import type { BookSource } from '@/types';

/** 单次检查的结果类型（与 Legado 校验结果对应） */
export type ValidateResultKind =
  | 'success'
  | 'network_error'
  | 'search_empty'
  | 'explore_empty'
  | 'toc_empty'
  | 'content_empty'
  | 'timeout'
  | 'js_error'
  | 'skip';

export interface SingleCheckResult {
  kind: ValidateResultKind;
  message?: string;
}

export interface SourceValidationResult {
  sourceUrl: string;
  sourceName: string;
  search: SingleCheckResult;
  explore: SingleCheckResult;
  toc: SingleCheckResult;
  content: SingleCheckResult;
}

const VALIDATE_TIMEOUT = 18000;

function classifyError(err: unknown): SingleCheckResult {
  if (err instanceof HttpError) {
    if (err.status === 408) {
      return { kind: 'timeout', message: err.message };
    }
    if (err.status === 0) {
      return { kind: 'network_error', message: err.message };
    }
    return { kind: 'network_error', message: err.message || `HTTP ${err.status}` };
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/timeout|AbortError/i.test(msg)) {
    return { kind: 'timeout', message: msg };
  }
  return { kind: 'js_error', message: msg };
}

/** 探测请求是否可达（用于区分“无结果”与“网络/超时”） */
function isProbeSuccess(
  probe: { ok: true } | SingleCheckResult,
): probe is { ok: true } {
  return 'ok' in probe && probe.ok === true;
}

async function probeGet(
  url: string,
  source: BookSource,
  timeout = VALIDATE_TIMEOUT
): Promise<{ ok: true } | SingleCheckResult> {
  try {
    const headers = parseHeaders(source.header);
    const text = await getBookSourcePage(source, url, {
      headers,
      timeout,
    });
    if (text == null || text.length === 0) {
      return { kind: 'network_error', message: '响应为空' };
    }
    return { ok: true };
  } catch (e) {
    return classifyError(e);
  }
}

/** 判断是否为脚本 URL（Legado 中 searchUrl/exploreUrl 可为 @js: / <js>...</js>） */
function isScriptUrl(url: string | undefined): boolean {
  if (typeof url !== 'string') return false;
  const s = url.trimStart();
  return s.startsWith('<js>') || /^@js:/i.test(s);
}

/** 校验搜索：有 searchUrl + ruleSearch 时执行；searchUrl 为脚本时跳过 */
async function validateSearch(source: BookSource): Promise<SingleCheckResult> {
  if (!source.searchUrl || !source.ruleSearch) {
    return { kind: 'skip', message: '无搜索规则' };
  }
  if (isScriptUrl(source.searchUrl)) {
    return { kind: 'skip', message: '搜索为脚本' };
  }
  try {
    const url = buildUrl(source.searchUrl, { key: '一' });
    const probe = await probeGet(url, source);
    if (!isProbeSuccess(probe)) return probe;
    const books = await searchBook(source, '一', {
      useCheckKeyword: true,
      shouldBreak: (size) => size > 0,
    });
    if (books.length > 0) return { kind: 'success' };
    return { kind: 'search_empty', message: '搜索无结果' };
  } catch (e) {
    return classifyError(e);
  }
}

/** 将相对路径转为绝对 URL（基于书源 origin） */
function toAbsoluteExploreUrl(source: BookSource, pathOrUrl: string): string {
  const s = pathOrUrl.trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/') && source.sourceUrl) {
    try {
      return new URL(source.sourceUrl).origin + s;
    } catch {
      return s;
    }
  }
  return s;
}

/** 校验发现：有 exploreUrl 时执行（含脚本发现、JSON 数组分类） */
async function validateExplore(source: BookSource): Promise<SingleCheckResult> {
  if (!source.exploreUrl) {
    return { kind: 'skip', message: '无发现' };
  }
  if (!source.ruleExplore) {
    return { kind: 'skip', message: '无发现规则' };
  }
  const raw = typeof source.exploreUrl === 'string' ? source.exploreUrl.trim() : '';
  try {
    if (isExploreUrlScript(source.exploreUrl)) {
      const sections = await getExploreSectionsAsync(source);
      if (sections.length === 0) {
        return { kind: 'explore_empty', message: '发现脚本无分类' };
      }
      const firstWithUrl = sections.find((s) => s.url && s.url.trim().length > 0);
      if (!firstWithUrl?.url) {
        return { kind: 'js_error', message: '发现脚本未返回有效 URL' };
      }
      const list = await exploreBook(source, 1, toAbsoluteExploreUrl(source, firstWithUrl.url));
      if (list.length > 0) return { kind: 'success' };
      return { kind: 'explore_empty', message: '发现无结果' };
    }
    // Legado 中 exploreUrl 也可能是 JSON 数组 [{"title","url"},...]，不能当作 URL 请求
    if (raw.startsWith('[')) {
      const sections = getExploreSections(source);
      const firstWithUrl = sections.find((s) => s.url && s.url.trim().length > 0);
      if (!firstWithUrl?.url) {
        return { kind: 'explore_empty', message: '发现分类无有效 URL' };
      }
      const exploreUrlToUse = toAbsoluteExploreUrl(source, firstWithUrl.url);
      const probe = await probeGet(buildUrl(exploreUrlToUse, { page: '1' }), source);
      if (!isProbeSuccess(probe)) return probe;
      const list = await exploreBook(source, 1, exploreUrlToUse);
      if (list.length > 0) return { kind: 'success' };
      return { kind: 'explore_empty', message: '发现无结果' };
    }
    const url = buildUrl(source.exploreUrl, { page: '1' });
    const probe = await probeGet(url, source);
    if (!isProbeSuccess(probe)) return probe;
    const list = await exploreBook(source, 1);
    if (list.length > 0) return { kind: 'success' };
    return { kind: 'explore_empty', message: '发现无结果' };
  } catch (e) {
    return classifyError(e);
  }
}

/** 取一本书的 tocUrl：优先从搜索结果（仅当 searchUrl 非脚本），否则从发现结果 */
async function getOneBookTocUrl(source: BookSource): Promise<string | null> {
  if (source.searchUrl && source.ruleSearch && !isScriptUrl(source.searchUrl)) {
    const books = await searchBook(source, '一', {
      useCheckKeyword: true,
      shouldBreak: (size) => size > 0,
    });
    const first = books[0];
    if (first?.tocUrl) return first.tocUrl;
    if (first?.bookUrl) return first.bookUrl;
  }
  if (source.exploreUrl && source.ruleExplore) {
    let exploreUrl: string | undefined;
    if (isExploreUrlScript(source.exploreUrl)) {
      const sections = await getExploreSectionsAsync(source);
      exploreUrl = sections.find((s) => s.url?.trim())?.url;
    } else {
      const sections = getExploreSections(source);
      exploreUrl = sections.find((s) => s.url?.trim())?.url;
    }
    if (exploreUrl) {
      const absoluteUrl = toAbsoluteExploreUrl(source, exploreUrl);
      const list = await exploreBook(source, 1, absoluteUrl);
      const first = list[0];
      if (first?.tocUrl) return first.tocUrl;
      if (first?.bookUrl) return first.bookUrl;
    }
  }
  return null;
}

/** 校验目录：有 ruleToc 且能拿到一本书的 tocUrl 时执行 */
async function validateToc(source: BookSource): Promise<SingleCheckResult> {
  if (!source.ruleToc) {
    return { kind: 'skip', message: '无目录规则' };
  }
  try {
    const tocUrl = await getOneBookTocUrl(source);
    if (!tocUrl) {
      return { kind: 'toc_empty', message: '无法获取书籍链接（需搜索或发现）' };
    }
    const chapters = await getChapterList(source, tocUrl);
    if (chapters.length > 0) return { kind: 'success' };
    return { kind: 'toc_empty', message: '目录为空' };
  } catch (e) {
    return classifyError(e);
  }
}

/** 校验正文：有 ruleContent 且能拿到目录与第一章时执行 */
async function validateContent(source: BookSource): Promise<SingleCheckResult> {
  if (!source.ruleContent) {
    return { kind: 'skip', message: '无正文规则' };
  }
  try {
    const tocUrl = await getOneBookTocUrl(source);
    if (!tocUrl) {
      return { kind: 'content_empty', message: '无法获取书籍链接' };
    }
    const chapters = await getChapterList(source, tocUrl);
    const first = chapters[0];
    if (!first) {
      return { kind: 'content_empty', message: '无章节可测' };
    }
    const content = await getContent(source, first);
    if (content && content.trim().length > 0) return { kind: 'success' };
    return { kind: 'content_empty', message: '正文为空' };
  } catch (e) {
    return classifyError(e);
  }
}

/**
 * 对单个书源执行完整校验（搜索、发现、目录、正文）
 */
export type ValidateSourceOptions = {
  /** 跳过发现检查 */
  skipExplore?: boolean;
  /** 仅测搜索 */
  searchOnly?: boolean;
};

export async function validateSource(
  source: BookSource,
  options?: ValidateSourceOptions,
): Promise<SourceValidationResult> {
  const skipExplore = options?.skipExplore || options?.searchOnly;
  const searchOnly = options?.searchOnly;
  const [search, explore, toc, content] = await Promise.all([
    validateSearch(source),
    skipExplore
      ? Promise.resolve({ kind: 'skip' as const, message: '已跳过发现' })
      : validateExplore(source),
    searchOnly
      ? Promise.resolve({ kind: 'skip' as const, message: '仅测搜索' })
      : validateToc(source),
    searchOnly
      ? Promise.resolve({ kind: 'skip' as const, message: '仅测搜索' })
      : validateContent(source),
  ]);
  return {
    sourceUrl: source.sourceUrl,
    sourceName: source.sourceName,
    search,
    explore,
    toc,
    content,
  };
}

export type ValidateSourcesOptions = ValidateSourceOptions & {
  /** 并发数，默认 2；会尊重书源 concurrentRate 的粗上限 */
  concurrency?: number;
};

function parseConcurrentCap(source: BookSource): number {
  const raw = String(source.concurrentRate ?? '').trim();
  if (!raw) return 2;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 2;
  return Math.min(4, Math.max(1, n));
}

/**
 * 批量校验书源（有限并发）
 */
export async function validateSources(
  sources: BookSource[],
  onProgress?: (current: number, total: number, sourceName: string) => void,
  options?: ValidateSourcesOptions,
): Promise<SourceValidationResult[]> {
  const results: SourceValidationResult[] = new Array(sources.length);
  const total = sources.length;
  let completed = 0;
  const baseConcurrency = Math.max(1, Math.min(4, options?.concurrency ?? 2));

  let cursor = 0;
  async function worker() {
    while (cursor < sources.length) {
      const i = cursor;
      cursor += 1;
      const source = sources[i]!;
      onProgress?.(completed + 1, total, source.sourceName);
      const cap = Math.min(baseConcurrency, parseConcurrentCap(source));
      void cap;
      results[i] = await validateSource(source, options);
      completed += 1;
      onProgress?.(completed, total, source.sourceName);
    }
  }

  const pool = Array.from({ length: Math.min(baseConcurrency, sources.length) }, () =>
    worker(),
  );
  await Promise.all(pool);
  return results;
}
