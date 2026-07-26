/**
 * 账号态平台源 HTTP 请求（netease / bili / ytm），与 LX 五源在线层解耦
 */

import type { RequestOptions } from '@/lib/http';
import { request } from '@/lib/http';
import { isTauri } from '@/lib/platform/detect';

function platformRequestOptions(
  init?: RequestInit & { headers?: Record<string, string> },
): Pick<
  RequestOptions,
  'method' | 'headers' | 'body' | 'useBackendHttp' | 'ignorePageNavigationAbort'
> {
  return {
    method: (init?.method ?? 'GET').toUpperCase() as RequestOptions['method'],
    headers: init?.headers,
    body: init?.body as string | undefined,
    useBackendHttp: isTauri(),
    ignorePageNavigationAbort: true,
  };
}

export async function platformFetchJson<T>(
  url: string,
  init?: RequestInit & { headers?: Record<string, string> },
): Promise<T> {
  const res = await request(url, platformRequestOptions(init));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return (await res.json()) as T;
}
