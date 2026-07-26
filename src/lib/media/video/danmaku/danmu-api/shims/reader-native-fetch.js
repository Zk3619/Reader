/**
 * 供 danmu_api vendor 使用的 fetch 兼容层：走 Reader @/lib/http（Tauri 绕 CORS）。
 * vendor http-util 需要标准 Fetch Response（headers.entries / text / arrayBuffer）。
 */
import { request } from '@/lib/http';

function toFetchHeaders(raw) {
  const h = new Headers();
  if (!raw) return h;
  for (const [key, value] of Object.entries(raw)) {
    if (value == null) continue;
    try {
      h.append(key, String(value));
    } catch {
      try {
        h.append(key, String(value).replace(/[^\x00-\xFF]/g, '?'));
      } catch {
        /* skip invalid header */
      }
    }
  }
  return h;
}

/** @param {import('@/lib/http').HttpResponse} res */
function wrapAsFetchResponse(res) {
  const headers = toFetchHeaders(res.headers);
  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText || (res.ok ? 'OK' : 'Error'),
    url: res.url,
    headers,
    redirected: false,
    type: 'basic',
    body: null,
    bodyUsed: false,
    text: () => res.text(),
    json: () => res.json(),
    arrayBuffer: () => res.arrayBuffer(),
    blob: async () => new Blob([await res.arrayBuffer()]),
    formData: async () => {
      throw new Error('formData() not supported');
    },
    clone() {
      return wrapAsFetchResponse(res);
    },
  };
}

/**
 * @param {string} url
 * @param {RequestInit & { signal?: AbortSignal }} [init]
 * @returns {Promise<Response>}
 */
export async function nativeFetch(url, init = {}) {
  const method = String(init.method || 'GET').toUpperCase();
  const headers = {};
  if (init.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => {
        headers[k] = v;
      });
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) headers[k] = v;
    } else {
      Object.assign(headers, init.headers);
    }
  }

  let body = init.body;
  if (
    body != null &&
    typeof body !== 'string' &&
    !(body instanceof FormData) &&
    !(body instanceof ArrayBuffer)
  ) {
    if (typeof Blob !== 'undefined' && body instanceof Blob) {
      body = await body.text();
    } else if (body instanceof Uint8Array) {
      body = new TextDecoder().decode(body);
    } else {
      body = String(body);
    }
  }

  const res = await request(url, {
    method,
    headers,
    body: body == null ? undefined : body,
    signal: init.signal,
    allowNon2xx: true,
    timeout: 30000,
    retry: 0,
  });

  return wrapAsFetchResponse(res);
}

export default nativeFetch;
