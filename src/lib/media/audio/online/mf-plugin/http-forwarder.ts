/**
 * MusicFree 插件 HTTP 转发（对齐 Desktop RequestForwarder / LX lx.request）
 * 沙箱内 axios 走 Reader 统一 request()，桌面端 useBackendHttp 绕过 CORS/TLS 限制。
 */

import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import { request } from '@/lib/http';
import { isTauri } from '@/lib/platform/detect';

function isTlsOrSendFailureMessage(msg: string): boolean {
  return /tls|ssl|certificate|handshake|eof|connection reset|unexpected eof/i.test(msg);
}

function buildUrl(config: AxiosRequestConfig): string {
  let url = String(config.url ?? '');
  if (config.baseURL && !/^https?:\/\//i.test(url)) {
    const base = config.baseURL.replace(/\/$/, '');
    url = `${base}/${url.replace(/^\//, '')}`;
  }
  if (config.params && typeof config.params === 'object') {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(config.params as Record<string, unknown>)) {
      if (v == null) continue;
      qs.set(k, String(v));
    }
    const q = qs.toString();
    if (q) url += (url.includes('?') ? '&' : '?') + q;
  }
  return url;
}

function normalizeHeaders(
  headers?: AxiosRequestConfig['headers'],
): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  if (typeof headers === 'object' && !Array.isArray(headers)) {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      if (v == null) continue;
      out[k] = String(v);
    }
  }
  if (out.cookie && !out.Cookie) {
    out.Cookie = out.cookie;
    delete out.cookie;
  }
  return out;
}

async function parseBody(
  res: Awaited<ReturnType<typeof request>>,
  responseType?: AxiosRequestConfig['responseType'],
): Promise<unknown> {
  if (responseType === 'arraybuffer') {
    return res.arrayBuffer();
  }
  if (responseType === 'blob') {
    const buf = await res.arrayBuffer();
    const mime =
      (typeof res.headers['content-type'] === 'string' && res.headers['content-type']) ||
      'application/octet-stream';
    return new Blob([buf], { type: mime });
  }
  const text = await res.text();
  if (responseType === 'text' || responseType === 'stream') return text;
  const ct = String(res.headers['content-type'] ?? '');
  if (/json|javascript|text\/plain/i.test(ct) || text.trim().startsWith('{') || text.trim().startsWith('[')) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

async function forwardAxiosConfig(config: AxiosRequestConfig): Promise<AxiosResponse> {
  const rawMethod = String(config.method ?? 'get').toUpperCase();
  const method =
    rawMethod === 'HEAD'
      ? 'GET'
      : (rawMethod as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH');
  const url = buildUrl(config);
  const headers = normalizeHeaders(config.headers);
  let body: string | undefined;
  if (config.data != null && rawMethod !== 'GET' && rawMethod !== 'HEAD') {
    if (typeof config.data === 'string') body = config.data;
    else if (config.data instanceof URLSearchParams) body = config.data.toString();
    else if (typeof config.data === 'object') {
      body = JSON.stringify(config.data);
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
    } else body = String(config.data);
  }
  const timeout =
    typeof config.timeout === 'number' && config.timeout > 0
      ? Math.min(config.timeout, 60_000)
      : 15_000;
  const requestOpts = {
    method,
    headers,
    body,
    timeout,
    allowNon2xx: true,
    useBackendHttp: isTauri(),
    ignorePageNavigationAbort: true,
  };

  let res: Awaited<ReturnType<typeof request>>;
  try {
    res = await request(url, requestOpts);
  } catch (firstErr) {
    const msg = firstErr instanceof Error ? firstErr.message : String(firstErr ?? '');
    if (isTauri() && isTlsOrSendFailureMessage(msg)) {
      res = await request(url, { ...requestOpts, useBackendHttp: false });
    } else {
      throw firstErr;
    }
  }

  const data = await parseBody(res, config.responseType);
  const status = res.status;
  const response = {
    data,
    status,
    statusText: String(status),
    headers: res.headers as AxiosResponse['headers'],
    config,
  } as AxiosResponse;
  if (!config.validateStatus || config.validateStatus(status)) {
    return response;
  }
  const err = new Error(`Request failed with status code ${status}`) as Error & {
    response?: AxiosResponse;
    config?: AxiosRequestConfig;
  };
  err.response = response;
  err.config = config;
  throw err;
}

export function createMfAxios() {
  const run = async (
    urlOrConfig: string | AxiosRequestConfig,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse> => {
    const merged: AxiosRequestConfig =
      typeof urlOrConfig === 'string'
        ? { ...config, url: urlOrConfig }
        : { ...urlOrConfig, ...config };
    return forwardAxiosConfig(merged);
  };
  const instance = Object.assign(run, {
    get: (url: string, config?: AxiosRequestConfig) =>
      run({ ...config, method: 'get', url }),
    post: (url: string, data?: unknown, config?: AxiosRequestConfig) =>
      run({ ...config, method: 'post', url, data }),
    put: (url: string, data?: unknown, config?: AxiosRequestConfig) =>
      run({ ...config, method: 'put', url, data }),
    delete: (url: string, config?: AxiosRequestConfig) =>
      run({ ...config, method: 'delete', url }),
    head: (url: string, config?: AxiosRequestConfig) =>
      run({ ...config, method: 'head', url }),
    patch: (url: string, data?: unknown, config?: AxiosRequestConfig) =>
      run({ ...config, method: 'patch', url, data }),
    request: run,
    defaults: { timeout: 15_000, headers: {} as Record<string, string> },
    create: () => createMfAxios(),
    isAxiosError: (err: unknown) =>
      Boolean(err && typeof err === 'object' && 'response' in (err as object)),
  });
  return instance;
}
