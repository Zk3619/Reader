/**
 * 在线源 HTTP 请求（Tauri 下走后端 HTTP，对齐 lx-music needle / UserApi preload）
 */

import type { RequestOptions } from '@/lib/http';
import { request } from '@/lib/http';
import { isTauri } from '@/lib/platform/detect';

function onlineRequestOptions(
  init?: RequestInit & { headers?: Record<string, string> },
): Pick<RequestOptions, 'method' | 'headers' | 'body' | 'useBackendHttp' | 'ignorePageNavigationAbort'> {
  return {
    method: (init?.method ?? 'GET').toUpperCase() as RequestOptions['method'],
    headers: init?.headers,
    body: init?.body as string | undefined,
    useBackendHttp: isTauri(),
    ignorePageNavigationAbort: true,
  };
}

export async function onlineFetchJson<T>(
  url: string,
  init?: RequestInit & { headers?: Record<string, string> },
): Promise<T> {
  const res = await request(url, onlineRequestOptions(init));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return (await res.json()) as T;
}

export async function onlineFetchText(
  url: string,
  init?: RequestInit & { headers?: Record<string, string> },
): Promise<string> {
  const res = await request(url, onlineRequestOptions(init));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}
