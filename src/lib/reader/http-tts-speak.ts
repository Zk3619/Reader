/**
 * HttpTTS 朗读（对齐 Legado HttpReadAloudService + AnalyzeUrl speakText）
 */

import { request } from '@/lib/http';
import type { HttpTTS } from '@/types';

function applySpeakUrlTemplate(
  url: string,
  speakText: string,
  speakSpeed: number,
): string {
  const encoded = encodeURIComponent(speakText);
  return url
    .replace(/\{\{speakText\}\}/gi, encoded)
    .replace(/\{\{speakSpeed\}\}/gi, String(speakSpeed))
    .replace(/\{\{java\.encodeURI\(speakText\)\}\}/gi, encoded);
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

/**
 * 请求 HttpTTS 音频，返回可用于 Audio 的 object URL（调用方负责 revoke）
 */
export async function fetchHttpTtsObjectUrl(
  httpTts: HttpTTS,
  speakText: string,
  speakSpeed = 5,
): Promise<string> {
  const url = applySpeakUrlTemplate(httpTts.url, speakText, speakSpeed);
  const headers = parseHeaders(httpTts.header);
  const res = await request(url, {
    method: 'GET',
    headers,
    timeout: 120_000,
    enableCookieJar: httpTts.enabledCookieJar === true,
  });
  const buf = await res.arrayBuffer();
  const blob = new Blob([buf], {
    type: httpTts.contentType || res.headers['content-type'] || 'audio/mpeg',
  });
  return URL.createObjectURL(blob);
}
