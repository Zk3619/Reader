/**
 * Legado AnalyzeUrl.UrlOption（JSON 尾缀）
 * 例：https://example.com/search?q=1, {"webView": true, "webJs": "..."}
 */

export const URL_OPTION_SPLIT = /\s*,\s*(?=\{)/;

export interface AnalyzeUrlOption {
  method: 'GET' | 'POST' | 'HEAD';
  headers: Record<string, string>;
  body?: string;
  charset?: string;
  origin?: string;
  retry?: number;
  type?: string;
  useWebView: boolean;
  webJs?: string;
  js?: string;
  bodyJs?: string;
  dnsIp?: string;
  serverID?: number;
  webViewDelayMs: number;
  /** 嗅探正文（AnalyzeUrl / 正文 sourceRegex） */
  sourceRegex?: string;
  overrideUrlRegex?: string;
}

export function splitUrlAndOption(raw: string): { urlPart: string; optionsJson?: string } {
  const trimmed = raw.trim();
  const match = trimmed.match(URL_OPTION_SPLIT);
  if (!match || match.index === undefined) {
    return { urlPart: trimmed };
  }
  const urlPart = trimmed.slice(0, match.index).trim();
  const optionsJson = trimmed.slice(match.index + match[0].length).trim();
  return { urlPart, optionsJson: optionsJson || undefined };
}

function asHeaderMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v == null) continue;
    out[String(k)] = String(v);
  }
  return out;
}

function parseUseWebView(value: unknown): boolean {
  if (value == null || value === '' || value === false || value === 'false') return false;
  return true;
}

/** 解析 UrlOption JSON（宽松，对齐 Legado GSON） */
export function parseAnalyzeUrlOption(jsonPart: string | undefined): AnalyzeUrlOption {
  const base: AnalyzeUrlOption = {
    method: 'GET',
    headers: {},
    useWebView: false,
    webViewDelayMs: 0,
  };
  if (!jsonPart?.trim()) return base;

  try {
    let opt: Record<string, unknown>;
    try {
      opt = JSON.parse(jsonPart) as Record<string, unknown>;
    } catch {
      // 宽松兼容：历史书源里常见单引号/未加引号 key
      opt = Function(`"use strict"; return (${jsonPart});`)() as Record<string, unknown>;
    }
    const methodRaw = typeof opt.method === 'string' ? opt.method.toUpperCase() : 'GET';
    base.method =
      methodRaw === 'POST' ? 'POST' : methodRaw === 'HEAD' ? 'HEAD' : 'GET';

    if (opt.body != null) {
      base.body = typeof opt.body === 'string' ? opt.body : JSON.stringify(opt.body);
    }

    if (opt.headers != null) {
      if (typeof opt.headers === 'string') {
        try {
          base.headers = asHeaderMap(JSON.parse(opt.headers));
        } catch {
          base.headers = {};
        }
      } else {
        base.headers = asHeaderMap(opt.headers);
      }
    }

    if (typeof opt.charset === 'string' && opt.charset) {
      base.charset = opt.charset;
      base.headers['X-UrlOption-Charset'] =
        base.headers['X-UrlOption-Charset'] ?? opt.charset;
    }

    if (typeof opt.origin === 'string' && opt.origin) {
      base.origin = opt.origin;
    } else if (typeof opt.bookSourceUrl === 'string' && opt.bookSourceUrl) {
      base.origin = opt.bookSourceUrl;
    }

    if (opt.retry != null && opt.retry !== '') {
      const n = Number(opt.retry);
      if (!Number.isNaN(n)) base.retry = n;
    }

    if (typeof opt.type === 'string') base.type = opt.type;
    base.useWebView = parseUseWebView(opt.webView);
    if (typeof opt.webJs === 'string' && opt.webJs.trim()) base.webJs = opt.webJs.trim();
    if (typeof opt.js === 'string' && opt.js.trim()) base.js = opt.js.trim();
    if (typeof opt.bodyJs === 'string' && opt.bodyJs.trim()) base.bodyJs = opt.bodyJs.trim();
    if (typeof opt.dnsIp === 'string') base.dnsIp = opt.dnsIp;
    if (opt.serverID != null && opt.serverID !== '') {
      const sid = Number(opt.serverID);
      if (!Number.isNaN(sid)) base.serverID = sid;
    }
    if (opt.webViewDelayTime != null && opt.webViewDelayTime !== '') {
      const d = Number(opt.webViewDelayTime);
      if (!Number.isNaN(d) && d > 0) base.webViewDelayMs = d;
    }
    if (typeof opt.sourceRegex === 'string' && opt.sourceRegex.trim()) {
      base.sourceRegex = opt.sourceRegex.trim();
    }
    if (typeof opt.overrideUrlRegex === 'string' && opt.overrideUrlRegex.trim()) {
      base.overrideUrlRegex = opt.overrideUrlRegex.trim();
    }
  } catch {
    console.warn('[analyze-url-option] UrlOption JSON 解析失败');
  }

  return base;
}
