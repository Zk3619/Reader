/**
 * 书源 JSON 网络拉取（支持 Legado #requestWithoutUA 后缀）
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '@/lib/platform/detect';

export const REQUEST_WITHOUT_UA_SUFFIX = '#requestWithoutUA';

export function stripRequestWithoutUaSuffix(url: string): { url: string; withoutUa: boolean } {
  const trimmed = url.trim();
  if (trimmed.endsWith(REQUEST_WITHOUT_UA_SUFFIX)) {
    return {
      url: trimmed.slice(0, -REQUEST_WITHOUT_UA_SUFFIX.length),
      withoutUa: true,
    };
  }
  return { url: trimmed, withoutUa: false };
}

export async function fetchBookSourceJsonText(urlRaw: string): Promise<string> {
  const { url, withoutUa } = stripRequestWithoutUaSuffix(urlRaw);
  if (!url) return '';

  if (isTauri()) {
    return invoke<string>('fetch_url_text', {
      url,
      timeoutMs: 30000,
      skipUserAgent: withoutUa,
    });
  }

  const headers: HeadersInit = {};
  if (withoutUa) {
    headers['User-Agent'] = 'null';
  }
  const res = await fetch(url, { mode: 'cors', headers });
  if (!res.ok) throw new Error(`请求失败: ${res.status}`);
  return res.text();
}
