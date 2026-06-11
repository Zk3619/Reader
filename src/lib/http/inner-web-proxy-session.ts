/**
 * 纯 Web 内嵌页：通过 Vite /__reader_http 会话在 iframe 内注入 Cookie 并代理 API。
 */

import { mergeLegadoCookieHeaderStrings } from '@/lib/js-engine/legado/normalize-legado-ajax-body';
import { encodeLegadoForwardHeaders } from '@/lib/http/legado-forward-headers';
import { isMobile, isTauri } from '@/lib/platform/detect';
import { resolveInnerWebUsesTauriPanel } from '@/lib/platform/inner-web-mode';

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
  initialCookies?: string,
): boolean {
  if (typeof window === 'undefined') return false;
  if (!pageUrl.trim().startsWith('http')) return false;
  if (!initialCookies?.trim()) return false;
  // Tauri 桌面 panel 由原生 WebView 注入 Cookie；仅 iframe 回退等场景走同源代理
  if (isTauri() && !isMobile()) {
    if (resolveInnerWebUsesTauriPanel({ url: pageUrl })) return false;
  }
  return true;
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
