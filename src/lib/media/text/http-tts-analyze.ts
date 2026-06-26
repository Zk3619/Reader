/**
 * HttpTTS URL 解析（对齐 Legado AnalyzeUrl speakText 模板）
 */

import type { HttpTTS } from '@/types';

export type HttpTtsRequestSpec = {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
  contentType?: string;
};

export function isJsHttpTtsUrl(url: string): boolean {
  return url.trimStart().startsWith('@js:');
}

function doubleEncodeUri(text: string): string {
  return encodeURIComponent(encodeURIComponent(text));
}

function applySpeakTemplate(
  template: string,
  speakText: string,
  speakSpeed: number,
): string {
  const encoded = encodeURIComponent(speakText);
  const doubleEncoded = doubleEncodeUri(speakText);
  return template
    .replace(/\{\{speakText\}\}/gi, speakText)
    .replace(/\{\{speakSpeed\}\}/gi, String(speakSpeed))
    .replace(/\{\{java\.encodeURI\(speakText\)\}\}/gi, encoded)
    .replace(/\{\{java\.encodeURI\(java\.encodeURI\(speakText\)\)\}\}/gi, doubleEncoded)
    .replace(/\{\{\(speakSpeed \+ 5\) \/ 10 \+ 4\}\}/gi, String((speakSpeed + 5) / 10 + 4))
    .replace(/\{\{String\(\(speakSpeed\) \* 20 - 400\)\}\}/gi, String(speakSpeed * 20 - 400));
}

function parseHeaders(header?: string | null): Record<string, string> {
  if (!header?.trim()) return {};
  try {
    const parsed = JSON.parse(header) as Record<string, string>;
    return parsed ?? {};
  } catch {
    const out: Record<string, string> = {};
    for (const line of header.split(/\r?\n/)) {
      const idx = line.indexOf(':');
      if (idx > 0) {
        out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    }
    return out;
  }
}

function parseLegadoUrlField(urlField: string): {
  baseUrl: string;
  config: Record<string, unknown> | null;
} {
  const trimmed = urlField.trim();
  if (isJsHttpTtsUrl(trimmed)) {
    return { baseUrl: trimmed, config: null };
  }
  const commaIdx = trimmed.indexOf(',');
  if (commaIdx < 0) {
    return { baseUrl: trimmed, config: null };
  }
  const baseUrl = trimmed.slice(0, commaIdx).trim();
  const jsonPart = trimmed.slice(commaIdx + 1).trim();
  try {
    const config = JSON.parse(jsonPart) as Record<string, unknown>;
    return { baseUrl, config };
  } catch {
    return { baseUrl: trimmed, config: null };
  }
}

/**
 * 将 HttpTTS 配置解析为可执行的 HTTP 请求规格
 */
export function buildHttpTtsRequest(
  httpTts: HttpTTS,
  speakText: string,
  speakSpeed: number,
  extraHeaders?: Record<string, string>,
): HttpTtsRequestSpec {
  if (isJsHttpTtsUrl(httpTts.url)) {
    throw new Error('该引擎使用 @js: 脚本，Web 端暂不支持播放');
  }

  const { baseUrl, config } = parseLegadoUrlField(httpTts.url);
  const headers = { ...parseHeaders(httpTts.header), ...extraHeaders };

  if (!config) {
    const url = applySpeakTemplate(baseUrl, speakText, speakSpeed);
    return {
      url,
      method: 'GET',
      headers,
      contentType: httpTts.contentType,
    };
  }

  const method = String(config.method ?? 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET';
  let url = baseUrl;
  let body: string | undefined;

  if (config.body != null) {
    const bodyTemplate =
      typeof config.body === 'string'
        ? config.body
        : JSON.stringify(config.body);
    body = applySpeakTemplate(bodyTemplate, speakText, speakSpeed);
    if (method === 'POST' && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
  } else {
    url = applySpeakTemplate(baseUrl, speakText, speakSpeed);
  }

  return {
    url,
    method,
    headers,
    body,
    contentType: httpTts.contentType,
  };
}

export function httpTtsConcurrentDelayMs(httpTts: HttpTTS): number {
  const raw = httpTts.concurrentRate;
  if (!raw || raw === '0') return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
