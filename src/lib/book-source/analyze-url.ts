/**
 * 对齐 Legado AnalyzeUrl：HTTP / WebView+webJs / js / bodyJs
 */

import type { BookSource } from '@/types';
import { request } from '@/lib/http';
import { parseHeaders, resolveUrl, sanitizeHttpHeaders } from '@/lib/book-source/utils';
import { buildSourceRequestHeaders, setCfActiveRequestOrigin } from '@/lib/book-source/source-http';
import {
  isJsMirrorJumpPage,
  looksLikeJsMirrorJumpResolved,
  resolveJsMirrorJumpTargets,
} from '@/lib/http/resolve-js-mirror-jump';
import { maybeBypassAcwScChallenge } from '@/lib/http/acw-sc-challenge';
import { mergeLegadoCookieHeaderStrings } from '@/lib/js-engine/legado/normalize-legado-ajax-body';
import { extractHostListFromJsLib } from '@/lib/book-source/utils';
import { evalJs } from '@/lib/js-engine';
import { getScriptBaseUrl } from '@/lib/js-engine/legado/source-script-shared';
import { runWebJs } from '@/lib/rule-engine/webjs-runner';
import {
  fetchPageHtmlViaCfWebView,
  shouldUseCfWebViewFetch,
} from '@/lib/book-source/cf-webview-fetch';
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
import {
  ScriptNoticeBlockedError,
  type ScriptNoticeBus,
} from '@/lib/book-source/rate-limit-guard';

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
  /** 脚本 toast 回调（java.toast / toast） */
  onScriptToast?: (msg?: unknown, level?: unknown) => void;
  /** 拉取完成后解析 HTML 限流提示；命中 rate_limit 时抛出 ScriptNoticeBlockedError */
  scriptNotice?: ScriptNoticeBus;
  /** HTTP 超时（毫秒），默认 30s */
  timeoutMs?: number;
}

export interface FetchByAnalyzeUrlResult {
  body: string;
  url: string;
  usedWebView: boolean;
}

async function runOptionJs(
  js: string,
  ctx: {
    url: string;
    result: string;
    baseUrl: string;
    source?: BookSource;
    onScriptToast?: (msg?: unknown, level?: unknown) => void;
  },
): Promise<string> {
  const out = await evalJs(js, {
    result: ctx.result,
    baseUrl: ctx.baseUrl,
    source: ctx.source as unknown as Record<string, unknown>,
    bookSource: ctx.source,
    onScriptToast: ctx.onScriptToast,
  });
  const text = out == null ? '' : String(out);
  return text.trim() ? text : ctx.result;
}

async function resolveTemplateInUrlRule(
  rule: string,
  ctx: {
    html?: string;
    baseUrl: string;
    source?: BookSource;
    onScriptToast?: (msg?: unknown, level?: unknown) => void;
  },
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
          bookSource: ctx.source,
          onScriptToast: ctx.onScriptToast,
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
  ctx: {
    html?: string;
    baseUrl: string;
    source?: BookSource;
    onScriptToast?: (msg?: unknown, level?: unknown) => void;
  },
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
      bookSource: ctx.source,
      onScriptToast: ctx.onScriptToast,
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
      bookSource: ctx.source,
      onScriptToast: ctx.onScriptToast,
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
  return sanitizeHttpHeaders({ ...sourceHeaders, ...optionHeaders });
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
  enabledCookieJar: boolean,
  timeoutMs?: number,
): Promise<string> {
  const { url: finalUrl, method, body } = prepareHttpRequest(url, option, headers);
  const res = await request(finalUrl, {
    method: method === 'POST' ? 'POST' : 'GET',
    headers,
    body,
    enableCookieJar: enabledCookieJar,
    timeout: timeoutMs,
  });
  return res.text();
}

async function fetchHttpWithRetry(
  url: string,
  option: AnalyzeUrlOption,
  headers: Record<string, string>,
  enabledCookieJar: boolean,
  timeoutMs?: number,
): Promise<string> {
  const maxAttempts = Math.max(1, (option.retry ?? 0) + 1);
  let lastError: unknown;
  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      return await fetchHttpOnce(url, option, headers, enabledCookieJar, timeoutMs);
    } catch (e) {
      lastError = e;
      if (i < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 300 * (i + 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function maybeFollowJsMirrorJump(
  body: string,
  url: string,
  option: AnalyzeUrlOption,
  headers: Record<string, string>,
  enabledCookieJar: boolean,
  timeoutMs: number | undefined,
  source: BookSource | undefined,
): Promise<{ body: string; url: string } | null> {
  if (!isJsMirrorJumpPage(body)) return null;

  const targets = resolveJsMirrorJumpTargets(body, url);
  if (targets.length === 0) return null;

  for (const mirrorUrl of targets) {
    try {
      const mirrorBody = await fetchHttpWithRetry(
        mirrorUrl,
        option,
        headers,
        enabledCookieJar,
        timeoutMs,
      );
      if (!looksLikeJsMirrorJumpResolved(mirrorBody)) continue;
      if (source) {
        try {
          setCfActiveRequestOrigin(source, new URL(mirrorUrl).origin);
        } catch {
          /* ignore */
        }
      }
      return { body: mirrorBody, url: mirrorUrl };
    } catch {
      continue;
    }
  }
  return null;
}

/** 按 Legado AnalyzeUrl 拉取页面正文 */
function finishAnalyzeUrlBody(
  body: string,
  scriptNotice?: ScriptNoticeBus,
): string {
  if (!scriptNotice || !body.trim()) return body;
  const notice = scriptNotice.consumeHtmlNotice(body);
  if (notice && scriptNotice.shouldBlockOnNotice(notice)) {
    throw new ScriptNoticeBlockedError(notice);
  }
  return body;
}

export async function fetchByAnalyzeUrl(
  params: FetchByAnalyzeUrlParams,
): Promise<FetchByAnalyzeUrlResult> {
  const keyword = params.keyword ?? '';
  const page = params.page ?? 1;
  const onScriptToast =
    params.onScriptToast ?? params.scriptNotice?.onScriptToast;
  const jsCtx = {
    html: params.html,
    baseUrl: params.baseUrl || '',
    source: params.source,
    onScriptToast,
  };
  const rawRuleUrl = await resolveTemplateInUrlRule(params.ruleUrl, jsCtx);
  const preprocessedRuleUrl = await resolveInlineJsInUrlRule(rawRuleUrl, jsCtx);
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
      onScriptToast,
    });
  }

  if (baseUrl && !/^https?:\/\//i.test(url)) {
    url = resolveUrl(baseUrl, url);
  }

  url = applyServerId(url, option, params.source);

  let headers: Record<string, string>;
  if (params.source) {
    const fromStore = buildSourceRequestHeaders(params.source, url);
    const fromTemplates = await mergeSourceHeaders(params.source, option, keyword, page);
    headers = sanitizeHttpHeaders({ ...fromStore, ...fromTemplates });
    if (params.cookies?.trim()) {
      const merged = mergeLegadoCookieHeaderStrings(
        headers.Cookie ?? headers.cookie ?? '',
        params.cookies.trim(),
      );
      if (merged) headers.Cookie = merged;
      delete headers.cookie;
    }
  } else {
    headers = { ...option.headers };
    if (params.cookies?.trim()) {
      headers.Cookie = headers.Cookie
        ? `${headers.Cookie}; ${params.cookies.trim()}`
        : params.cookies.trim();
    }
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
      sourceKey: params.source?.bookSourceUrl ?? params.source?.sourceUrl,
      source: params.source,
      jsLib: params.source?.jsLib,
    };
    body = await runWebJs(webOpts);
  } else if (!body) {
    const cookieForCf = mergeLegadoCookieHeaderStrings(
      params.cookies?.trim() ?? '',
      String(headers.Cookie ?? headers.cookie ?? '').trim(),
    );
    if (params.source && shouldUseCfWebViewFetch(params.source, cookieForCf)) {
      usedWebView = true;
      body = await fetchPageHtmlViaCfWebView(
        params.source,
        url,
        params.cookies?.trim() ?? '',
        headers,
      );
    } else {
      const useCookieJar = params.source?.enabledCookieJar === true;
      body = await fetchHttpWithRetry(url, option, headers, useCookieJar, params.timeoutMs);
      const acwBypass = await maybeBypassAcwScChallenge(
        body,
        url,
        option,
        headers,
        useCookieJar,
        params.timeoutMs,
        params.source,
        fetchHttpWithRetry,
      );
      if (acwBypass) {
        body = acwBypass.body;
        url = acwBypass.url;
      }
      const jumped = await maybeFollowJsMirrorJump(
        body,
        url,
        option,
        headers,
        useCookieJar,
        params.timeoutMs,
        params.source,
      );
      if (jumped) {
        body = jumped.body;
        url = jumped.url;
      }
    }
  }

  if (option.bodyJs) {
    body = await runOptionJs(option.bodyJs, {
      url,
      result: body,
      baseUrl,
      source: params.source,
      onScriptToast,
    });
  }

  return {
    body: finishAnalyzeUrlBody(body, params.scriptNotice),
    url,
    usedWebView,
  };
}
