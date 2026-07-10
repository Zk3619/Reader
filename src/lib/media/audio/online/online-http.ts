/**
 * 在线源 HTTP 请求（适配 Reader HTTP 层）
 */

import type { RequestOptions } from '@/lib/http';
import { request } from '@/lib/http';

export async function onlineFetchJson<T>(
  url: string,
  init?: RequestInit & { headers?: Record<string, string> },
): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase() as RequestOptions['method'];
  const res = await request(url, {
    method,
    headers: init?.headers,
    body: init?.body as string | undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return (await res.json()) as T;
}

export async function onlineFetchText(
  url: string,
  init?: RequestInit & { headers?: Record<string, string> },
): Promise<string> {
  const method = (init?.method ?? 'GET').toUpperCase() as RequestOptions['method'];
  const res = await request(url, {
    method,
    headers: init?.headers,
    body: init?.body as string | undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}
