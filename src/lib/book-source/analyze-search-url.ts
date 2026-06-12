/**
 * 解析 Legado searchUrl（对齐 AnalyzeUrl：JS、{{}}、分页、UrlOption）
 */

import type { BookSource } from '@/types';
import {
  buildUrl,
  collapseUrlPathSlashes,
  resolveUrl,
  sanitizeHttpHeaders,
  stripLegadoSourceUrlMarker,
} from '@/lib/book-source/utils';
import {
  alignUrlToBookSourceRequestOrigin,
  buildSourceRequestHeaders,
  resolveBookSourceRequestOrigin,
} from '@/lib/book-source/source-http';
import {
  getLegadoSourceKey,
  getScriptBaseUrl,
} from '@/lib/js-engine/legado/source-script-shared';
import {
  evalSearchUrlExpression,
  extractSearchScript,
  isScriptSearchUrl,
  runSearchUrlScript,
} from '@/lib/book-source/search-script-runner';
import {
  parseAnalyzeUrlOption,
  splitUrlAndOption,
} from '@/lib/book-source/analyze-url-option';
import { encodeLegadoFormBody, inferPostContentType } from '@/lib/book-source/analyze-url-post';

export type ResolvedSearchRequest = {
  url: string;
  /** 含 UrlOption 尾缀，供 fetchByAnalyzeUrl / WebView 使用 */
  ruleUrlWithOption: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  charset?: string;
  useWebView?: boolean;
  webJs?: string;
  webViewDelayMs?: number;
  sourceRegex?: string;
};

export { isScriptSearchUrl };

const JS_BLOCK_RE = /<js>([\s\S]*?)<\/js>|@js:([^\s@]+)/g;

/** 同一 sortUrl + 页码的 JS/{{}} 展开结果（避免 fetchUrl / ruleBaseUrl 各跑一遍脚本） */
const legadoRuleUrlExpandedCache = new Map<string, string>();

function legadoRuleUrlExpandCacheKey(
  source: BookSource,
  ruleUrl: string,
  keyword: string,
  page: number,
): string {
  return `${getLegadoSourceKey(source)}\0${ruleUrl}\0${keyword}\0${page}`;
}

async function expandLegadoRuleUrlRaw(
  ruleUrl: string,
  source: BookSource,
  keyword: string,
  page: number,
): Promise<string> {
  const trimmed = ruleUrl.trim();
  if (!trimmed) return '';

  const cacheKey = legadoRuleUrlExpandCacheKey(source, trimmed, keyword, page);
  const cached = legadoRuleUrlExpandedCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let url = trimmed;
  if (isScriptSearchUrl(url)) {
    const script = extractSearchScript(url);
    if (!script) {
      legadoRuleUrlExpandedCache.set(cacheKey, url);
      return url;
    }
    url = await runSearchUrlScript(script, source, keyword, page);
  } else {
    url = await analyzeEmbeddedJsBlocks(url, source, keyword, page);
  }

  url = await expandInnerJsTemplates(url, source, keyword, page);
  url = buildUrl(url, { key: keyword, page: String(page) });
  url = substitutePagePlaceholders(url, page);

  legadoRuleUrlExpandedCache.set(cacheKey, url);
  return url;
}

/** 每次拉取文章列表前调用，避免沿用上次的展开结果，同时仍可在同一次请求内复用缓存 */
export function invalidateLegadoRuleUrlExpandCache(source: BookSource): void {
  const prefix = `${getLegadoSourceKey(source)}\0`;
  for (const key of legadoRuleUrlExpandedCache.keys()) {
    if (key.startsWith(prefix)) legadoRuleUrlExpandedCache.delete(key);
  }
}

function substitutePagePlaceholders(input: string, page: number): string {
  return input.replace(/<([^>]+)>/g, (_, inner: string) => {
    const pages = inner.split(',').map((p: string) => p.trim());
    if (pages.length === 0) return String(page);
    const idx = page - 1;
    return idx < pages.length ? pages[idx] : pages[pages.length - 1];
  });
}

function extractBalancedInner(input: string, start: number): { content: string; end: number } | null {
  const chars = [...input];
  let pos = start;
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  const exprStart = pos;

  while (pos < chars.length) {
    const c = chars[pos];
    if (c === '\\' && pos + 1 < chars.length) {
      pos += 2;
      continue;
    }
    if (c === "'" && !inDouble) {
      inSingle = !inSingle;
      pos++;
      continue;
    }
    if (c === '"' && !inSingle) {
      inDouble = !inDouble;
      pos++;
      continue;
    }
    if (inSingle || inDouble) {
      pos++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      if (depth === 0) {
        return { content: chars.slice(exprStart, pos).join(''), end: pos };
      }
      depth--;
    }
    pos++;
  }
  return null;
}

async function expandInnerJsTemplatesOnce(
  input: string,
  source: BookSource,
  keyword: string,
  page: number,
): Promise<string> {
  if (!input.includes('{{') || !input.includes('}}')) return input;

  let result = '';
  let pos = 0;
  while (pos < input.length) {
    const start = input.indexOf('{{', pos);
    if (start === -1) {
      result += input.slice(pos);
      break;
    }
    result += input.slice(pos, start);
    const inner = extractBalancedInner(input, start + 2);
    if (!inner) {
      result += '{{';
      pos = start + 2;
      continue;
    }
    const expr = inner.content.trim();
    const evaluated = await evalSearchUrlExpression(expr, source, keyword, page);
    result += evaluated;
    pos = inner.end + 2;
  }
  return result;
}

/** 多轮展开，直至无 {{ 或达到上限 */
async function expandInnerJsTemplates(
  input: string,
  source: BookSource,
  keyword: string,
  page: number,
): Promise<string> {
  let out = input;
  for (let i = 0; i < 4 && out.includes('{{') && out.includes('}}'); i++) {
    const next = await expandInnerJsTemplatesOnce(out, source, keyword, page);
    if (next === out) break;
    out = next;
  }
  return out;
}

async function analyzeEmbeddedJsBlocks(
  raw: string,
  source: BookSource,
  keyword: string,
  page: number,
): Promise<string> {
  let result = raw;
  let start = 0;
  const re = new RegExp(JS_BLOCK_RE.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = re.exec(raw)) !== null) {
    if (match.index > start) {
      const prefix = raw.slice(start, match.index).trim();
      if (prefix) {
        result = prefix.replace(/@result/g, result);
      }
    }
    const jsBody = (match[1] ?? match[2] ?? '').trim();
    result = await evalSearchUrlExpression(jsBody, source, keyword, page, result);
    start = match.index + match[0].length;
  }

  if (raw.length > start) {
    const suffix = raw.slice(start).trim();
    if (suffix) {
      result = suffix.replace(/@result/g, result);
    }
  }
  return result;
}

/** 展开 header 字段中的 {{...}} 模板 */
export async function expandHeaderTemplates(
  headers: Record<string, string>,
  source: BookSource,
  keyword: string,
  page: number,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.trim().startsWith('@') || String(value).trim().startsWith('@js')) continue;
    const expandedKey = key.includes('{{')
      ? await expandInnerJsTemplates(key, source, keyword, page)
      : key;
    const expandedValue = value.includes('{{')
      ? await expandInnerJsTemplates(value, source, keyword, page)
      : value;
    if (expandedKey && expandedValue != null) {
      out[expandedKey] = expandedValue;
    }
  }
  return out;
}

/**
 * 展开 Legado 规则 URL（{{js}}、<js>、{{page}}、<1,2,3> 分页占位）
 * 用于 RSS sortUrl、searchUrl 等（对齐 AnalyzeUrl.replaceKeyPageJs）
 */
export async function resolveLegadoRuleUrl(
  ruleUrl: string,
  source: BookSource,
  options: {
    keyword?: string;
    page?: number;
    /** RSS 列表规则 baseUrl：勿经 URL 构造编码查询串 */
    forRuleBase?: boolean;
    /** HTTP 拉取时保留 AnalyzeUrl JSON 尾缀（method/body 等） */
    preserveUrlOptions?: boolean;
  } = {},
): Promise<string> {
  const keyword = options.keyword ?? '';
  const page = options.page ?? 1;
  const url = await expandLegadoRuleUrlRaw(ruleUrl, source, keyword, page);
  if (!url) return '';

  const { urlPart, optionsJson } = splitUrlAndOption(url);
  const base =
    resolveBookSourceRequestOrigin(source) ||
    getScriptBaseUrl(source) ||
    source.sourceUrl ||
    '';
  let absoluteUrl = urlPart.trim();
  if (!/^https?:\/\//i.test(absoluteUrl)) {
    absoluteUrl = resolveUrl(base, absoluteUrl);
  }
  const normalized = options.forRuleBase ? absoluteUrl : collapseUrlPathSlashes(absoluteUrl);
  const aligned = alignUrlToBookSourceRequestOrigin(normalized, source);
  const result = stripLegadoSourceUrlMarker(aligned.replace(/\/##[^/?#]*/g, ''));
  if (options.preserveUrlOptions && optionsJson && !options.forRuleBase) {
    return `${result},${optionsJson}`;
  }
  return result;
}

/**
 * 将书源 searchUrl 解析为可发起的 HTTP 请求（对齐 Legado AnalyzeUrl）
 */
export async function resolveSearchRequest(
  source: BookSource,
  keyword: string,
  page = 1,
  noticeOptions?: { onScriptToast?: (msg?: unknown, level?: unknown) => void },
): Promise<ResolvedSearchRequest> {
  const rawSearchUrl = source.searchUrl?.trim();
  if (!rawSearchUrl) {
    throw new Error('搜索 url 不能为空');
  }

  let ruleUrl: string;
  if (isScriptSearchUrl(rawSearchUrl)) {
    const script = extractSearchScript(rawSearchUrl);
    if (!script) throw new Error('searchUrl 脚本无效');
    ruleUrl = await runSearchUrlScript(script, source, keyword, page, {
      onScriptToast: noticeOptions?.onScriptToast,
    });
  } else {
    ruleUrl = await analyzeEmbeddedJsBlocks(rawSearchUrl, source, keyword, page);
  }

  ruleUrl = await expandInnerJsTemplates(ruleUrl, source, keyword, page);
  ruleUrl = buildUrl(ruleUrl, { key: keyword, page: String(page) });
  ruleUrl = substitutePagePlaceholders(ruleUrl, page);

  const { urlPart, optionsJson } = splitUrlAndOption(ruleUrl);
  const urlOption = parseAnalyzeUrlOption(optionsJson);
  const base =
    resolveBookSourceRequestOrigin(source) ||
    getScriptBaseUrl(source) ||
    source.sourceUrl ||
    '';
  let absoluteUrl = urlPart;
  if (!/^https?:\/\//i.test(absoluteUrl)) {
    absoluteUrl = resolveUrl(base, absoluteUrl);
  }
  absoluteUrl = collapseUrlPathSlashes(absoluteUrl);
  absoluteUrl = alignUrlToBookSourceRequestOrigin(absoluteUrl, source);

  const options = urlOption;
  let body = options.body;
  if (body) {
    body = await expandInnerJsTemplates(body, source, keyword, page);
    body = buildUrl(body, { key: keyword, page: String(page) });
    body = substitutePagePlaceholders(body, page);
  }

  const sourceHeaders = await expandHeaderTemplates(
    buildSourceRequestHeaders(source, absoluteUrl),
    source,
    keyword,
    page,
  );
  const optionHeaders = await expandHeaderTemplates(
    options.headers,
    source,
    keyword,
    page,
  );
  const mergedHeaders = sanitizeHttpHeaders({ ...sourceHeaders, ...optionHeaders });
  const charset = (mergedHeaders['X-UrlOption-Charset'] ?? options.charset)?.trim();
  delete mergedHeaders['X-UrlOption-Charset'];

  if (options.method === 'POST' && body?.trim()) {
    const trimmed = body.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      body = await encodeLegadoFormBody(trimmed, charset);
      if (!Object.keys(mergedHeaders).some((h) => h.toLowerCase() === 'content-type')) {
        const ct = inferPostContentType(body, charset);
        if (ct) mergedHeaders['Content-Type'] = ct;
      }
    }
  }

  const ruleUrlWithOption =
    optionsJson?.trim() ? `${absoluteUrl}, ${optionsJson.trim()}` : absoluteUrl;

  return {
    url: absoluteUrl,
    ruleUrlWithOption,
    method: options.method === 'HEAD' ? 'GET' : options.method,
    headers: mergedHeaders,
    body,
    charset,
    useWebView: options.useWebView,
    webJs: options.webJs,
    webViewDelayMs: options.webViewDelayMs,
    sourceRegex: options.sourceRegex,
  };
}
