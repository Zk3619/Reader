/**
 * 内嵌网页文档代理：纯 Web 走 Vite /__reader_http；Tauri 用 panel 或 iframe + Cookie 注入。
 */

import { mergeLegadoCookieHeaderStrings } from '@/lib/js-engine/legado/normalize-legado-ajax-body';
import { encodeLegadoForwardHeaders } from '@/lib/http/legado-forward-headers';
import { isTauri } from '@/lib/platform/detect';

const PROXY_SEGMENT = '__reader_http';

function proxyPath(): string {
  const external = import.meta.env.VITE_WEB_HTTP_PROXY as string | undefined;
  if (external?.trim()) {
    const base = external.trim().replace(/\/$/, '');
    return base.includes('?') ? base.split('?')[0]! : base;
  }
  const baseUrl = import.meta.env.BASE_URL || '/';
  return new URL(PROXY_SEGMENT, new URL(baseUrl, window.location.href)).pathname;
}

export function shouldUseInnerWebDocumentProxy(pageUrl: string): boolean {
  if (typeof window === 'undefined') return false;
  const url = pageUrl.trim();
  if (!url.startsWith('http')) return false;

  // Tauri：panel 直连或 iframe + set_cookies_for_inner_web；不走 Vite __reader_http（生产包无此中间件）
  if (isTauri()) return false;

  // 纯 Web iframe：跨域页常设 X-Frame-Options / CSP frame-ancestors，须走 __reader_http
  return true;
}

/** 是否须 __reader_http 文档代理（含显式 useProxyDocument） */
export function needsInnerWebDocumentProxy(
  pageUrl: string,
  options?: { useProxyDocument?: boolean; initialCookies?: string },
): boolean {
  if (options?.useProxyDocument) return true;
  return shouldUseInnerWebDocumentProxy(pageUrl);
}

export async function createInnerWebProxySession(
  targetUrl: string,
  cookies: string,
  forwardHeaders?: Record<string, string>,
  options?: { cloudflareChallenge?: boolean },
): Promise<string> {
  const body: {
    target: string;
    cookies: string;
    forwardHeaders?: string;
    cloudflareChallenge?: boolean;
  } = {
    target: targetUrl.trim(),
    cookies: cookies.trim(),
    cloudflareChallenge: options?.cloudflareChallenge === true,
  };
  const encoded = encodeLegadoForwardHeaders(forwardHeaders);
  if (encoded) body.forwardHeaders = encoded;
  const res = await fetch(`${proxyPath()}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  });
  if (!res.ok) {
    throw new Error(`创建内嵌页会话失败: ${res.status}`);
  }
  const json = (await res.json()) as { sessionId?: string };
  if (!json.sessionId) {
    throw new Error('创建内嵌页会话失败: 无 sessionId');
  }
  return json.sessionId;
}

/** iframe 导航：与页内 fetch 劫持同走 ?target=&session=（/doc 缺 Referer 等，段评页会空白） */
export function buildInnerWebDocumentProxyUrl(
  sessionId: string,
  targetUrl: string,
): string {
  const trimmed = targetUrl.trim();
  return `${resolveInnerWebProxyPath()}?target=${encodeURIComponent(trimmed)}&session=${encodeURIComponent(sessionId)}`;
}

/** 供 iframe 内联脚本拼接代理 URL */
export function resolveInnerWebProxyPath(): string {
  return proxyPath();
}

/** 规范化 inner-web 文档 target URL（去 hash、尾斜杠） */
export function normalizeInnerWebTargetUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = '';
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.origin}${path}${u.search}`;
  } catch {
    return url.trim();
  }
}

/** 从 iframe src 解析 __reader_http 的 target 参数；非代理 src 则返回原 URL */
export function resolveInnerWebProxyIframeTarget(
  iframeSrc: string | undefined,
  baseOrigin?: string,
): string | null {
  const raw = iframeSrc?.trim();
  if (!raw) return null;
  try {
    const base =
      baseOrigin ??
      (typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    const u = new URL(raw, base);
    if (u.pathname.includes(PROXY_SEGMENT)) {
      return u.searchParams.get('target');
    }
    return raw;
  } catch {
    return null;
  }
}

/** blob/srcdoc 正文内须用应用源绝对地址，避免 <base href> 把 /__reader_http 解析到书源域 */
export function resolveAbsoluteInnerWebProxyBase(): string {
  const path = resolveInnerWebProxyPath();
  if (typeof window === 'undefined') return path;
  try {
    const u = new URL(path, window.location.href);
    return `${u.origin}${u.pathname}`.replace(/\/$/, '');
  } catch {
    return path;
  }
}

export async function readInnerWebProxySessionCookies(sessionId: string): Promise<string> {
  const res = await fetch(
    `${proxyPath()}/session/${encodeURIComponent(sessionId)}/cookies`,
    { credentials: 'same-origin' }
  );
  if (!res.ok) return '';
  return res.text();
}

export async function updateInnerWebProxySessionCookies(
  sessionId: string,
  cookies: string
): Promise<void> {
  await fetch(`${proxyPath()}/session/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookies: cookies.trim() }),
    credentials: 'same-origin',
  });
}

/** 将 iframe / 宿主上报的 Cookie 合并进会话（勿整段覆盖，避免冲掉代理 API 已写入的新配置） */
export async function mergeInnerWebProxySessionCookies(
  sessionId: string,
  cookies: string
): Promise<void> {
  const incoming = cookies.trim();
  if (!incoming) return;
  const existing = (await readInnerWebProxySessionCookies(sessionId)).trim();
  const merged = existing
    ? mergeLegadoCookieHeaderStrings(existing, incoming)
    : incoming;
  await updateInnerWebProxySessionCookies(sessionId, merged);
}

export async function deleteInnerWebProxySession(sessionId: string): Promise<void> {
  try {
    await fetch(`${proxyPath()}/session/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
  } catch {
    /* ignore */
  }
}

/**
 * 纯 Web：经 __reader_http 会话拉取 HTML（cf_clearance 须与过验证时同一代理链路）。
 */
export async function fetchHtmlViaInnerWebProxySession(
  pageUrl: string,
  cookies: string,
  forwardHeaders?: Record<string, string>,
  options?: { cloudflareChallenge?: boolean },
): Promise<string> {
  const target = pageUrl.trim();
  if (!target.startsWith('http')) {
    throw new Error('代理会话拉取需要 http(s) URL');
  }
  if (typeof window === 'undefined') {
    throw new Error('代理会话拉取仅适用于浏览器环境');
  }

  const sessionId = await createInnerWebProxySession(
    target,
    cookies,
    forwardHeaders,
    options,
  );
  try {
    const proxyFetchUrl = `${resolveInnerWebProxyPath()}?target=${encodeURIComponent(target)}&session=${encodeURIComponent(sessionId)}`;
    const res = await fetch(proxyFetchUrl, {
      method: 'GET',
      credentials: 'same-origin',
    });
    const body = await res.text();
    if (!res.ok) {
      const { HttpError } = await import('@/lib/http');
      throw new HttpError(
        res.status,
        res.statusText || 'Error',
        target,
        `代理会话拉取 HTTP ${res.status}`,
        body || undefined,
      );
    }
    return body;
  } finally {
    await deleteInnerWebProxySession(sessionId);
  }
}
