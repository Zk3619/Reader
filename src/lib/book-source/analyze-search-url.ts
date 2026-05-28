/**
 * 解析 Legado searchUrl（对齐 AnalyzeUrl：JS、{{}}、分页、UrlOption）
 */

import type { BookSource } from '@/types';
import { buildUrl, collapseUrlPathSlashes, resolveUrl } from '@/lib/book-source/utils';
import { getScriptBaseUrl } from '@/lib/js-engine/legado/source-script-shared';
import { parseHeaders } from '@/lib/book-source/utils';
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

export type ResolvedSearchRequest = {
  url: string;
  /** 含 UrlOption 尾缀，供 fetchByAnalyzeUrl / WebView 使用 */
  ruleUrlWithOption: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  useWebView?: boolean;
  webJs?: string;
  webViewDelayMs?: number;
  sourceRegex?: string;
};

export { isScriptSearchUrl };

const JS_BLOCK_RE = /<js>([\s\S]*?)<\/js>|@js:([^\s@]+)/g;

/** 按首个「, {」拆分 URL 与 UrlOption（与 legado paramPattern 一致） */
function splitUrlOptions(raw: string): { urlPart: string; optionsJson?: string } {
  let braceDepth = 0;
  let inQuote: "'" | '"' | null = null;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inQuote) {
      if (c === inQuote && raw[i - 1] !== '\\') inQuote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inQuote = c;
      continue;
    }
    if (c === '{') braceDepth++;
    else if (c === '}') braceDepth--;
    else if (c === ',' && braceDepth === 0) {
      const rest = raw.slice(i + 1).trimStart();
      if (rest.startsWith('{') || rest.startsWith('[')) {
        return { urlPart: raw.slice(0, i).trim(), optionsJson: rest };
      }
    }
  }
  return { urlPart: raw.trim() };
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

function parseUrlOptions(jsonPart: string | undefined): {
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
} {
  const out: {
    method: 'GET' | 'POST';
    headers: Record<string, string>;
    body?: string;
  } = { method: 'GET', headers: {} };
  if (!jsonPart?.trim()) return out;

  try {
    const opt = JSON.parse(jsonPart) as Record<string, unknown>;
    const method = typeof opt.method === 'string' ? opt.method.toUpperCase() : 'GET';
    out.method = method === 'POST' ? 'POST' : 'GET';
    if (opt.body != null) {
      out.body = typeof opt.body === 'string' ? opt.body : JSON.stringify(opt.body);
    }
    const headers = opt.headers as Record<string, string> | undefined;
    if (headers && typeof headers === 'object') {
      out.headers = { ...headers };
    }
    if (typeof opt.charset === 'string' && opt.charset) {
      out.headers['X-UrlOption-Charset'] = out.headers['X-UrlOption-Charset'] ?? String(opt.charset);
    }
  } catch {
    console.warn('[analyze-search-url] UrlOption JSON 解析失败');
  }
  return out;
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

function sanitizeHttpHeaders(headers: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};
  const tokenRe = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
  for (const [rawKey, rawValue] of Object.entries(headers)) {
    const key = rawKey.trim();
    const value = String(rawValue ?? '').trim();
    if (!key || !tokenRe.test(key)) continue;
    if (key.includes('{{') || key.includes('}}') || key.includes('@')) continue;
    if (value.includes('{{') || value.includes('}}')) continue;
    if (value === 'null') continue;
    safe[key] = value;
  }
  return safe;
}

function inferBodyContentType(body: string): 'json' | 'form' | 'text' {
  const trimmed = body.trim();
  if (!trimmed) return 'text';
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return 'json';
  }
  if (trimmed.includes('=') && (trimmed.includes('&') || /^[^=&\s]+=[^=&\s]*$/.test(trimmed))) {
    return 'form';
  }
  return 'text';
}

/**
 * 将书源 searchUrl 解析为可发起的 HTTP 请求（对齐 Legado AnalyzeUrl）
 */
export async function resolveSearchRequest(
  source: BookSource,
  keyword: string,
  page = 1,
): Promise<ResolvedSearchRequest> {
  const rawSearchUrl = source.searchUrl?.trim();
  if (!rawSearchUrl) {
    throw new Error('搜索 url 不能为空');
  }

  let ruleUrl: string;
  if (isScriptSearchUrl(rawSearchUrl)) {
    const script = extractSearchScript(rawSearchUrl);
    if (!script) throw new Error('searchUrl 脚本无效');
    ruleUrl = await runSearchUrlScript(script, source, keyword, page);
  } else {
    ruleUrl = await analyzeEmbeddedJsBlocks(rawSearchUrl, source, keyword, page);
  }

  ruleUrl = await expandInnerJsTemplates(ruleUrl, source, keyword, page);
  ruleUrl = buildUrl(ruleUrl, { key: keyword, page: String(page) });
  ruleUrl = substitutePagePlaceholders(ruleUrl, page);

  const { urlPart, optionsJson } = splitUrlAndOption(ruleUrl);
  const urlOption = parseAnalyzeUrlOption(optionsJson);
  const base = getScriptBaseUrl(source) || source.sourceUrl || '';
  let absoluteUrl = urlPart;
  if (!/^https?:\/\//i.test(absoluteUrl)) {
    absoluteUrl = resolveUrl(base, absoluteUrl);
  }
  absoluteUrl = collapseUrlPathSlashes(absoluteUrl);

  const options = urlOption;
  let body = options.body;
  if (body) {
    body = await expandInnerJsTemplates(body, source, keyword, page);
    body = buildUrl(body, { key: keyword, page: String(page) });
    body = substitutePagePlaceholders(body, page);
  }

  const sourceHeaders = await expandHeaderTemplates(
    parseHeaders(source.header),
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
  const charset = mergedHeaders['X-UrlOption-Charset']?.trim();
  delete mergedHeaders['X-UrlOption-Charset'];
  if (options.method === 'POST' && body && !Object.keys(mergedHeaders).some((h) => h.toLowerCase() === 'content-type')) {
    const bodyType = inferBodyContentType(body);
    if (bodyType === 'json') {
      mergedHeaders['Content-Type'] = charset
        ? `application/json; charset=${charset}`
        : 'application/json';
    } else if (bodyType === 'form') {
      mergedHeaders['Content-Type'] = charset
        ? `application/x-www-form-urlencoded; charset=${charset}`
        : 'application/x-www-form-urlencoded';
    } else if (charset) {
      mergedHeaders['Content-Type'] = `text/plain; charset=${charset}`;
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
    useWebView: options.useWebView,
    webJs: options.webJs,
    webViewDelayMs: options.webViewDelayMs,
    sourceRegex: options.sourceRegex,
  };
}
