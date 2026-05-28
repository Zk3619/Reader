/**
 * 对齐 Legado AnalyzeUrl：HTTP / WebView+webJs / js / bodyJs
 */

import type { BookSource } from '@/types';
import { request } from '@/lib/http';
import { parseHeaders, resolveUrl } from '@/lib/book-source/utils';
import { extractHostListFromJsLib } from '@/lib/book-source/utils';
import { evalJs } from '@/lib/js-engine';
import { getScriptBaseUrl } from '@/lib/js-engine/legado/source-script-shared';
import { runWebJs } from '@/lib/rule-engine/webjs-runner';
import type { RunWebJsOptions } from '@/lib/rule-engine/webjs-script';
import {
  parseAnalyzeUrlOption,
  splitUrlAndOption,
  type AnalyzeUrlOption,
} from '@/lib/book-source/analyze-url-option';
import { expandHeaderTemplates } from '@/lib/book-source/analyze-search-url';
import {
  encodeFormBody,
  encodeQueryString,
  inferPostContentType,
} from '@/lib/book-source/analyze-url-post';
import { parseXPath } from '@/lib/rule-engine/xpath-parser';
import { parseJsonPath } from '@/lib/rule-engine/jsonpath-parser';

export type { AnalyzeUrlOption } from '@/lib/book-source/analyze-url-option';
export { parseAnalyzeUrlOption, splitUrlAndOption } from '@/lib/book-source/analyze-url-option';

export interface FetchByAnalyzeUrlParams {
  ruleUrl: string;
  source?: BookSource;
  keyword?: string;
  page?: number;
  html?: string;
  baseUrl?: string;
  cookies?: string;
  defaultWebViewDelayMs?: number;
}

export interface FetchByAnalyzeUrlResult {
  body: string;
  url: string;
  usedWebView: boolean;
}

async function runOptionJs(
  js: string,
  ctx: { url: string; result: string; baseUrl: string; source?: BookSource },
): Promise<string> {
  const out = await evalJs(js, {
    result: ctx.result,
    baseUrl: ctx.baseUrl,
    source: ctx.source as unknown as Record<string, unknown>,
  });
  const text = out == null ? '' : String(out);
  return text.trim() ? text : ctx.result;
}

async function resolveTemplateInUrlRule(
  rule: string,
  ctx: { html?: string; baseUrl: string; source?: BookSource },
): Promise<string> {
  if (!rule.includes('{{')) return rule;
  const html = ctx.html ?? '';
  const re = /\{\{([\s\S]*?)\}\}/g;
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rule)) !== null) {
    out += rule.slice(last, m.index);
    const inner = (m[1] ?? '').trim();
    if (inner) {
      let v = '';
      if (inner.startsWith('//') || inner.startsWith('/')) {
        v = parseXPath(inner, html, ctx.baseUrl)[0] ?? '';
      } else if (inner.startsWith('$.') || inner.startsWith('$[')) {
        v = parseJsonPath(inner, html)[0] ?? '';
      } else {
        const x = await evalJs(inner, {
          result: html,
          baseUrl: ctx.baseUrl,
          source: ctx.source as unknown as Record<string, unknown>,
        });
        v = x == null ? '' : String(x);
      }
      out += v;
    }
    last = m.index + m[0].length;
  }
  out += rule.slice(last);
  return out;
}

async function resolveInlineJsInUrlRule(
  rule: string,
  ctx: { html?: string; baseUrl: string; source?: BookSource },
): Promise<string> {
  const input = rule.trim();
  if (!input) return '';

  const jsTag = input.match(/^([\s\S]*?)<js>([\s\S]*?)<\/js>([\s\S]*)$/i);
  if (jsTag) {
    const before = (jsTag[1] ?? '').trim();
    const script = (jsTag[2] ?? '').trim();
    const after = (jsTag[3] ?? '').trim();
    const seed = after || before || ctx.html || '';
    const out = await evalJs(script, {
      result: seed,
      baseUrl: ctx.baseUrl,
      source: ctx.source as unknown as Record<string, unknown>,
    });
    return out == null ? '' : String(out).trim();
  }

  const jsPrefixIdx = input.toLowerCase().indexOf('@js:');
  if (jsPrefixIdx >= 0) {
    const before = input.slice(0, jsPrefixIdx).trim();
    const script = input.slice(jsPrefixIdx + 4).trim();
    const out = await evalJs(script, {
      result: before || ctx.html || '',
      baseUrl: ctx.baseUrl,
      source: ctx.source as unknown as Record<string, unknown>,
    });
    return out == null ? '' : String(out).trim();
  }

  return input;
}

async function mergeSourceHeaders(
  source: BookSource | undefined,
  option: AnalyzeUrlOption,
  keyword: string,
  page: number,
): Promise<Record<string, string>> {
  if (!source) return { ...option.headers };
  const [sourceHeaders, optionHeaders] = await Promise.all([
    expandHeaderTemplates(parseHeaders(source.header), source, keyword, page),
    expandHeaderTemplates(option.headers, source, keyword, page),
  ]);
  return { ...sourceHeaders, ...optionHeaders };
}

function applyDnsIp(headers: Record<string, string>, dnsIp?: string, requestUrl?: string): void {
  if (!dnsIp?.trim()) return;
  try {
    const host = new URL(requestUrl ?? 'https://placeholder').hostname;
    headers.Host = dnsIp.trim();
    if (host && !headers['X-Forwarded-Host']) {
      headers['X-Forwarded-Host'] = host;
    }
  } catch {
    headers.Host = dnsIp.trim();
  }
}

function applyServerId(url: string, option: AnalyzeUrlOption, source?: BookSource): string {
  if (option.serverID == null || option.serverID < 0 || !source) return url;
  const hosts = extractHostListFromJsLib(source as unknown as Record<string, unknown>);
  const base = hosts[option.serverID];
  if (!base) return url;
  try {
    const target = new URL(url);
    const origin = new URL(base);
    return `${origin.origin}${target.pathname}${target.search}${target.hash}`;
  } catch {
    return url;
  }
}

function prepareHttpRequest(
  url: string,
  option: AnalyzeUrlOption,
  headers: Record<string, string>,
): { url: string; method: 'GET' | 'POST' | 'HEAD'; body?: string } {
  let finalUrl = url;
  let body = option.body;

  if (option.method === 'POST' && body?.trim()) {
    const trimmed = body.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      body = encodeFormBody(trimmed, option.charset);
      const ct = inferPostContentType(body, option.charset);
      if (ct) headers['Content-Type'] = headers['Content-Type'] ?? ct;
    }
  } else if (option.method === 'GET' && body?.trim()) {
    const q = encodeQueryString(body.trim(), option.charset);
    finalUrl = finalUrl.includes('?') ? `${finalUrl}&${q}` : `${finalUrl}?${q}`;
    body = undefined;
  }

  return { url: finalUrl, method: option.method, body };
}

async function fetchHttpOnce(
  url: string,
  option: AnalyzeUrlOption,
  headers: Record<string, string>,
): Promise<string> {
  const { url: finalUrl, method, body } = prepareHttpRequest(url, option, headers);
  const res = await request(finalUrl, {
    method: method === 'POST' ? 'POST' : method === 'HEAD' ? 'HEAD' : 'GET',
    headers,
    body,
    enableCookieJar: true,
  });
  return res.text();
}

async function fetchHttpWithRetry(
  url: string,
  option: AnalyzeUrlOption,
  headers: Record<string, string>,
): Promise<string> {
  const maxAttempts = Math.max(1, (option.retry ?? 0) + 1);
  let lastError: unknown;
  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      return await fetchHttpOnce(url, option, headers);
    } catch (e) {
      lastError = e;
      if (i < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 300 * (i + 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** 按 Legado AnalyzeUrl 拉取页面正文 */
export async function fetchByAnalyzeUrl(
  params: FetchByAnalyzeUrlParams,
): Promise<FetchByAnalyzeUrlResult> {
  const keyword = params.keyword ?? '';
  const page = params.page ?? 1;
  const rawRuleUrl = await resolveTemplateInUrlRule(params.ruleUrl, {
    html: params.html,
    baseUrl: params.baseUrl || '',
    source: params.source,
  });
  const preprocessedRuleUrl = await resolveInlineJsInUrlRule(rawRuleUrl, {
    html: params.html,
    baseUrl: params.baseUrl || '',
    source: params.source,
  });
  const { urlPart, optionsJson } = splitUrlAndOption(preprocessedRuleUrl);
  const option = parseAnalyzeUrlOption(optionsJson);

  let url = urlPart.trim();
  const baseUrl = params.baseUrl || option.origin || getScriptBaseUrl(params.source!) || url;

  if (option.js) {
    url = await runOptionJs(option.js, {
      url,
      result: url,
      baseUrl,
      source: params.source,
    });
  }

  if (baseUrl && !/^https?:\/\//i.test(url)) {
    url = resolveUrl(baseUrl, url);
  }

  url = applyServerId(url, option, params.source);

  const headers = params.source
    ? await mergeSourceHeaders(params.source, option, keyword, page)
    : { ...option.headers };

  if (params.cookies?.trim()) {
    headers.Cookie = headers.Cookie
      ? `${headers.Cookie}; ${params.cookies.trim()}`
      : params.cookies.trim();
  }

  applyDnsIp(headers, option.dnsIp, url);

  const delayMs =
    option.webViewDelayMs > 0
      ? option.webViewDelayMs
      : option.useWebView
        ? params.defaultWebViewDelayMs ?? 900
        : 0;

  let body = params.html ?? '';
  let usedWebView = false;

  if (option.useWebView || option.webJs) {
    usedWebView = true;
    const webOpts: RunWebJsOptions = {
      url: /^https?:\/\//i.test(url) ? url : undefined,
      html: params.html,
      baseUrl,
      script: option.webJs ?? '',
      priorResult: params.html ?? body,
      headers,
      cookies: params.cookies,
      delayMs,
      sourceRegex: option.sourceRegex,
      overrideUrlRegex: option.overrideUrlRegex,
      timeoutMs: 60_000,
      cacheFirst: true,
      isRule: true,
      sourceKey: params.source?.bookSourceUrl,
      source: params.source,
      jsLib: params.source?.jsLib,
    };
    body = await runWebJs(webOpts);
  } else if (!body) {
    body = await fetchHttpWithRetry(url, option, headers);
  }

  if (option.bodyJs) {
    body = await runOptionJs(option.bodyJs, {
      url,
      result: body,
      baseUrl,
      source: params.source,
    });
  }

  return { body, url, usedWebView };
}
