/**
 * TLS/JA3 impersonation bridge.
 *
 * Priority（需 tls-impersonate / VITE_YTDLP_TLS_IMPERSONATE=1）:
 *   1. http_fetch_rquest — in-process wreq Emulation
 *   2. http_fetch_impersonate — 桌面 PATH 上 curl-impersonate-*（强风控/HTTP3 兜底）
 *   3. null → Client-Hints + 普通 download_binary（reqwest Plain）
 *
 * 关闭：缺省 lite，或 VITE_YTDLP_TLS_IMPERSONATE=0 / READER_SKIP_TLS_IMPERSONATE=1
 */

export type ImpersonateFetchResult = {
  status: number;
  body: string;
  headers: Record<string, string>;
  via: 'rquest' | 'curl-impersonate' | 'unavailable';
};

type InvokePayload = {
  status: number;
  body: string;
  headers?: Record<string, string>;
  available?: boolean;
  via?: string;
};

async function invokeFetch(
  command: 'http_fetch_rquest' | 'http_fetch_impersonate',
  url: string,
  opts?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | null;
    profile?: string;
    timeoutMs?: number;
  },
): Promise<InvokePayload | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<InvokePayload>(command, {
      url,
      method: opts?.method || 'GET',
      headers: opts?.headers || null,
      body: opts?.body ?? null,
      profile: opts?.profile || 'chrome',
      timeoutMs: opts?.timeoutMs ?? 60000,
    });
  } catch {
    return null;
  }
}

/**
 * Try JA3-capable fetches; return null when unavailable so callers fall back.
 */
export async function tryImpersonateFetch(
  url: string,
  opts?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | null;
    profile?: string;
    timeoutMs?: number;
  },
): Promise<ImpersonateFetchResult | null> {
  if (import.meta.env.VITE_YTDLP_TLS_IMPERSONATE !== '1') {
    return null;
  }

  // 1) In-process wreq Emulation（桌面 / Android / iOS）
  const rquest = await invokeFetch('http_fetch_rquest', url, opts);
  if (rquest && rquest.available !== false && rquest.status > 0) {
    return {
      status: rquest.status,
      body: rquest.body,
      headers: rquest.headers || {},
      via: 'rquest',
    };
  }

  // 2) External curl-impersonate（可选；桌面强风控兜底）
  const curl = await invokeFetch('http_fetch_impersonate', url, opts);
  if (curl && curl.available !== false && curl.status > 0) {
    return {
      status: curl.status,
      body: curl.body,
      headers: curl.headers || {},
      via: 'curl-impersonate',
    };
  }

  return null;
}
