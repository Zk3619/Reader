/**
 * HttpTTS 朗读（对齐 Legado HttpReadAloudService + AnalyzeUrl speakText）
 */

import { buildHttpTtsRequest } from '@/lib/media/text/http-tts-analyze';
import { request } from '@/lib/http';
import type { HttpTTS } from '@/types';

/**
 * 请求 HttpTTS 音频，返回可用于 Audio 的 object URL（调用方负责 revoke）
 */
export async function fetchHttpTtsObjectUrl(
  httpTts: HttpTTS,
  speakText: string,
  speakSpeed = 5,
  extraHeaders?: Record<string, string>,
): Promise<string> {
  const spec = buildHttpTtsRequest(httpTts, speakText, speakSpeed, extraHeaders);
  const res = await request(spec.url, {
    method: spec.method,
    headers: spec.headers,
    body: spec.body,
    timeout: 120_000,
    enableCookieJar: httpTts.enabledCookieJar === true,
  });
  const buf = await res.arrayBuffer();
  const blob = new Blob([buf], {
    type: spec.contentType || res.headers['content-type'] || 'audio/mpeg',
  });
  return URL.createObjectURL(blob);
}
