/**
 * Cloudflare 人机挑战：对齐 Legado WebViewActivity（_cf_chl_opt → 保存 Cookie → 重试请求）。
 * 纯 Web / Tauri 均通过 InnerWeb（iframe 或子 WebView）完成验证并写入书源 Cookie 池。
 */

import type { BookSource } from '@/types';
import { HttpError } from '@/lib/http';
import { looksLikeCloudflareChallengeHtml } from '@/lib/http/cf-protected-cdn';
import {
  buildSourceRequestHeaders,
  getCfActiveRequestOrigin,
  resolveBookSourceCatalogOrigin,
  resolveBookSourceRequestOrigin,
  resolveSourceCookiesForHttp,
  getCfActiveUserAgent,
  setCfActiveRequestOrigin,
  setCfActiveUserAgent,
} from '@/lib/book-source/source-http';
import { syncSourceCookiesAfterInnerWeb } from '@/lib/book-source/source-cookie-pool';
import {
  getActiveWebProxySessionId,
  loadPersistedInnerWebSession,
  openInnerWebAwait,
} from '@/lib/platform/inner-web';
import { isTauri } from '@/lib/platform/detect';

/** 内嵌页过 CF 后应出现的 Cookie（HttpOnly，document.cookie 读不到，须走代理会话） */
export function cookieHeaderLooksCfCleared(cookieHeader: string): boolean {
  return /(?:^|;\s*)(?:cf_clearance|__cf_bm)=/i.test(cookieHeader.trim());
}

/** 验证页用站点 origin，确保 cf_clearance 对整个域名生效 */
export function resolveCloudflareVerificationUrl(
  requestUrl: string,
  source?: BookSource,
): string {
  if (source) {
    const active = getCfActiveRequestOrigin(source);
    if (active) return active;
    const preferred = resolveBookSourceRequestOrigin(source);
    if (preferred) return preferred;
  }
  const u = requestUrl.trim();
  if (u.startsWith('http')) {
    try {
      return new URL(u).origin;
    } catch {
      /* fall through */
    }
  }
  const fromSource = source?.sourceUrl?.trim();
  if (fromSource?.startsWith('http')) {
    try {
      return new URL(fromSource).origin;
    } catch {
      return fromSource;
    }
  }
  return u;
}

/** CF 完成后将 Cookie 写入请求域、书源域、panel 跳转域（镜像站） */
async function collectCfCookiePersistOrigins(
  requestUrl: string,
  verifyUrl: string,
): Promise<string[]> {
  const out = new Set<string>();
  const add = (raw: string) => {
    const t = raw.trim();
    if (!t.startsWith('http')) return;
    try {
      out.add(new URL(t).origin);
    } catch {
      out.add(t);
    }
  };
  add(requestUrl);
  add(verifyUrl);
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const panelUrl = (await invoke<string>('get_inner_web_panel_current_url')).trim();
      add(panelUrl);
    } catch {
      /* panel 已关闭 */
    }
  } else {
    const session = loadPersistedInnerWebSession();
    if (session?.url?.startsWith('http')) add(session.url);
  }
  return [...out];
}

async function persistCfCookiesToAllOrigins(
  source: BookSource,
  cookieHeader: string,
  origins: string[],
): Promise<void> {
  const trimmed = cookieHeader.trim();
  if (!trimmed) return;
  const { persistSourceCookieHeaderForPage, mirrorSourceCookiesToHttpJar } =
    await import('@/lib/book-source/source-cookie-pool');
  for (const origin of origins) {
    persistSourceCookieHeaderForPage(source, origin, trimmed);
    await mirrorSourceCookiesToHttpJar(origin, trimmed);
  }
}

export function isCloudflareBlockedResponse(
  status: number,
  body: string,
  headers?: Record<string, string>,
): boolean {
  const h = headers ?? {};
  if (h['X-Reader-Cf-Challenge'] === '1' || h['x-reader-cf-challenge'] === '1') {
    return true;
  }
  const snippet = String(body ?? '').slice(0, 4096);
  if (!snippet.trim()) {
    return status === 403 || status === 503;
  }
  if (looksLikeCloudflareChallengeHtml(snippet)) return true;
  if ((status === 403 || status === 503) && snippet.length < 2048) {
    return /cf-ray|cloudflare/i.test(snippet);
  }
  return false;
}

export function shouldOfferCloudflareVerification(error: unknown): boolean {
  if (typeof window === 'undefined') return false;
  if (!(error instanceof HttpError)) return false;
  if (error.status !== 403 && error.status !== 503) return false;
  // 仅当响应体确实是 CF 挑战页时才验证；业务错误页（如「域名未授权」、JSON 错误）不触发，
  // 否则会把普通 API 域误记为 CF 活跃域，导致后续 JSON 请求被塞进 WebView 渲染。
  const body = error.body;
  if (body != null && body.trim()) {
    return isCloudflareBlockedResponse(error.status, body);
  }
  // 无正文（如纯网络层 403）时保守按挑战处理
  return true;
}

/**
 * 打开内嵌页供用户完成 CF 挑战；√ 后同步 Cookie 到书源池。
 * @returns 用户是否确认并完成同步
 */
export async function resolveCloudflareViaInnerWeb(options: {
  url: string;
  source: BookSource;
  title?: string;
}): Promise<boolean> {
  const requestUrl = options.url.trim();
  if (!requestUrl.startsWith('http')) return false;

  const verifyUrl = resolveCloudflareVerificationUrl(requestUrl, options.source);
  const sourceKey = (options.source.bookSourceUrl ?? options.source.sourceUrl)?.trim();
  const cookies = resolveSourceCookiesForHttp(options.source, verifyUrl);
  const pageTitle =
    options.title?.trim() ||
    `Cloudflare 验证 — ${options.source.sourceName?.trim() || '书源'}`;

  const forward = buildSourceRequestHeaders(options.source, verifyUrl);
  const headerCookie = (forward.Cookie ?? forward.cookie ?? '').trim();
  delete forward.Cookie;
  delete forward.cookie;
  /** panel 使用 WebView 原生 UA 过 CF，勿把书源 Android UA 注入 panel */
  delete forward['User-Agent'];
  delete forward['user-agent'];
  const initialCookies = (cookies || headerCookie).trim();

  const result = await openInnerWebAwait({
    title: pageTitle,
    url: verifyUrl,
    showConfirm: true,
    cookieSyncUrl: verifyUrl,
    initialCookies: initialCookies || undefined,
    bookSourceUrl: sourceKey,
    /**
     * Tauri：原生 panel 直连站点（可读 HttpOnly cf_clearance）。
     * 纯 Web：须走 __reader_http 同源代理，否则 X-Frame-Options 会拦截直连 iframe。
     */
    useProxyDocument: !isTauri(),
    cloudflareVerification: true,
    proxyForwardHeaders: forward,
  });

  if (!result.confirmed) return false;

  const fromUi = result.cookies?.trim() ?? '';
  const persistOrigins = await collectCfCookiePersistOrigins(requestUrl, verifyUrl);
  let merged = await syncSourceCookiesAfterInnerWeb(
    options.source,
    requestUrl,
    fromUi,
  );
  if (!merged && fromUi && cookieHeaderLooksCfCleared(fromUi)) {
    merged = fromUi;
  }
  if (merged) {
    await persistCfCookiesToAllOrigins(options.source, merged, persistOrigins);
    const catalog = resolveBookSourceCatalogOrigin(options.source);
    const mirror = persistOrigins.find((o) => o && o !== catalog);
    const active = mirror ?? catalog;
    if (active) {
      setCfActiveRequestOrigin(options.source, active);
      if (isTauri()) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const panelUa = (await invoke<string>('get_inner_web_panel_user_agent')).trim();
          if (panelUa) {
            setCfActiveUserAgent(options.source, panelUa);
          }
        } catch {
          /* ignore */
        }
      }
      console.warn('[cf-verify] 已记录 CF 活跃域（后续发现/请求将使用该 origin）', {
        catalog,
        active,
        ua: getCfActiveUserAgent(options.source)?.slice(0, 96),
      });
    }
  }
  if (!merged) {
    console.warn('[cf-verify] √ 后未读到 Cookie，请确认挑战已完成（须含 cf_clearance）', {
      uiLen: fromUi.length,
      confirmed: result.confirmed,
      hadProxySession: Boolean(getActiveWebProxySessionId()),
      persistOrigins,
    });
    return false;
  }
  if (!cookieHeaderLooksCfCleared(merged)) {
    console.warn(
      '[cf-verify] Cookie 已同步但未含 cf_clearance/__cf_bm，后续请求可能仍被拦截',
      { len: merged.length },
    );
  }
  return true;
}
