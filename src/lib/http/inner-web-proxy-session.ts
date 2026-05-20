/**
 * 纯 Web 内嵌页：通过 Vite /__reader_http 会话在 iframe 内注入 Cookie 并代理 API。
 */

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
  cookies: string
): Promise<string> {
  const res = await fetch(`${proxyPath()}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target: targetUrl.trim(), cookies: cookies.trim() }),
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

export function buildInnerWebDocumentProxyUrl(sessionId: string): string {
  return `${proxyPath()}/doc?session=${encodeURIComponent(sessionId)}`;
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
    body: JSON.stringify({ cookies }),
    credentials: 'same-origin',
  });
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
