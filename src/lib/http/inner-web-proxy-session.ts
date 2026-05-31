/**
 * 纯 Web 内嵌页：通过 Vite /__reader_http 会话在 iframe 内注入 Cookie 并代理 API。
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

export function shouldUseInnerWebDocumentProxy(
  pageUrl: string,
  initialCookies?: string
): boolean {
  if (isTauri() || typeof window === 'undefined') return false;
  if (!pageUrl.trim().startsWith('http')) return false;
  return Boolean(initialCookies?.trim());
}

export async function createInnerWebProxySession(
  targetUrl: string,
  cookies: string,
  forwardHeaders?: Record<string, string>,
): Promise<string> {
  const body: { target: string; cookies: string; forwardHeaders?: string } = {
    target: targetUrl.trim(),
    cookies: cookies.trim(),
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
  return `${proxyPath()}?target=${encodeURIComponent(trimmed)}&session=${encodeURIComponent(sessionId)}`;
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
