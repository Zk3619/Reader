/**
 * 解析 Legado java.ajax 调用参数（与 login/explore runner 共用）
 */

export type AjaxCall = {
  urlStr: string;
  method: 'GET' | 'POST';
  body?: string;
  headers: Record<string, string>;
  callback: ((body: string) => void) | null;
};

/** Legado ajax 逗号 JSON 中的 params 对象 → URL 查询串 */
function appendAjaxParamsToUrl(urlStr: string, params: unknown): string {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return urlStr;
  const entries = Object.entries(params as Record<string, unknown>).filter(
    ([, v]) => v != null && String(v).trim() !== '',
  );
  if (entries.length === 0) return urlStr;
  const qs = entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return urlStr.includes('?') ? `${urlStr}&${qs}` : `${urlStr}?${qs}`;
}

function applyCommaJsonAjaxOptions(
  opts: Record<string, unknown>,
  state: { method: 'GET' | 'POST'; body?: string; headers: Record<string, string>; urlStr: string },
): void {
  state.method = ((opts.method as string) || state.method).toUpperCase() as 'GET' | 'POST';
  if (opts.body != null) {
    state.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  }
  const h = opts.headers as Record<string, string> | undefined;
  if (h && typeof h === 'object') state.headers = { ...state.headers, ...h };
  if (opts.params != null) {
    state.urlStr = appendAjaxParamsToUrl(state.urlStr, opts.params);
  }
}

export function parseAjaxArgs(
  url: string | Record<string, unknown>,
  optionsOrCb?: Record<string, unknown> | ((body: string) => void),
  cb?: (body: string) => void
): AjaxCall | null {
  let method: 'GET' | 'POST' = 'GET';
  let body: string | undefined;
  let headers: Record<string, string> = {};
  let callback: ((body: string) => void) | null = null;

  if (typeof optionsOrCb === 'function') {
    callback = optionsOrCb;
  } else if (typeof cb === 'function') {
    callback = cb;
    if (optionsOrCb && typeof optionsOrCb === 'object') {
      method = ((optionsOrCb.method as string) || 'GET').toUpperCase() as 'GET' | 'POST';
      body = optionsOrCb.body as string | undefined;
      const h = optionsOrCb.headers as Record<string, string> | undefined;
      if (h && typeof h === 'object') headers = { ...headers, ...h };
    }
  } else if (optionsOrCb && typeof optionsOrCb === 'object') {
    method = ((optionsOrCb.method as string) || 'GET').toUpperCase() as 'GET' | 'POST';
    body = optionsOrCb.body as string | undefined;
    const h = optionsOrCb.headers as Record<string, string> | undefined;
    if (h && typeof h === 'object') headers = { ...headers, ...h };
  }

  let urlStr = typeof url === 'string' ? url : '';
  if (!urlStr && url != null && typeof url === 'object') {
    const u = url as Record<string, unknown>;
    if (Array.isArray(url) && url.length > 0) {
      urlStr = String((url as unknown[])[0] ?? '');
    } else {
      urlStr = (u.url ?? u.href ?? '') as string;
    }
  }

  if (urlStr && !optionsOrCb && typeof urlStr === 'string') {
    const comma = urlStr.indexOf(',');
    if (comma > 0) {
      const after = urlStr.slice(comma + 1).trim();
      urlStr = urlStr.slice(0, comma).trim();
      if (after && (after.startsWith('{') || after.startsWith('['))) {
        try {
          const opts = JSON.parse(after) as Record<string, unknown>;
          const state = { method, body, headers, urlStr };
          applyCommaJsonAjaxOptions(opts, state);
          method = state.method;
          body = state.body;
          headers = state.headers;
          urlStr = state.urlStr;
        } catch { /* 整段当 URL */ }
      }
    }
  }

  if (!urlStr || urlStr.includes('[object Object]')) {
    return null;
  }

  return { urlStr, method, body, headers, callback };
}
