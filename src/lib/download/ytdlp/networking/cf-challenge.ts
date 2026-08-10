/**
 * ytdlp HTTP × Cookie Hub CF：遇 Cloudflare 挑战时弹 InnerWeb，验证后带 clearance 重试。
 * cf_clearance 绑定 WebView 指纹时走 panel fetch（与书源 CF 管线一致）。
 */

import type { BookSource } from '@/types';
import { HttpError } from '@/lib/http';
import {
  isCloudflareBlockedResponse,
  shouldOfferCloudflareVerification,
} from '@/lib/http/cloudflare-verification';
import {
  ensureSiteAccess,
  makeYtdlpDownloadScope,
  resolveSiteCookies,
  siteScopeAsBookSource,
} from '@/lib/cookie-hub';
import {
  fetchPageHtmlViaCfWebView,
  shouldUseCfWebViewFetch,
} from '@/lib/book-source/cf-webview-fetch';

export function makeYtdlpDownloadScopeFromUrl(url: string): ReturnType<typeof makeYtdlpDownloadScope> {
  return makeYtdlpDownloadScope(url);
}

function mergeCookieHeader(
  headers: Record<string, string>,
  cookie: string,
): Record<string, string> {
  const next = { ...headers };
  const existing = (next.Cookie || next.cookie || '').trim();
  const merged = [cookie.trim(), existing].filter(Boolean).join('; ');
  if (merged) {
    next.Cookie = merged;
    delete next.cookie;
  }
  return next;
}

function applyPanelUa(
  headers: Record<string, string>,
  panelUa?: string,
): Record<string, string> {
  const ua = panelUa?.trim();
  if (!ua) return headers;
  const next = { ...headers };
  next['User-Agent'] = ua;
  delete next['user-agent'];
  return next;
}

/**
 * 包装一次文本拉取：403/503 CF 挑战 → ensureSiteAccess → Cookie/panel 重试。
 */
export async function fetchTextWithYtdlpCloudflareRetry(opts: {
  url: string;
  headers: Record<string, string>;
  ieName?: string;
  /** false 时不弹验证（无头/测试） */
  interactive?: boolean;
  fetchOnce: (headers: Record<string, string>) => Promise<string>;
}): Promise<string> {
  const interactive = opts.interactive !== false && typeof window !== 'undefined';
  const scope = makeYtdlpDownloadScope(opts.url);
  const source = siteScopeAsBookSource(scope, opts.url);

  const run = async (headers: Record<string, string>): Promise<string> => {
    const resolved = resolveSiteCookies(scope, opts.url, source);
    let hdrs = headers;
    if (resolved.cookies) hdrs = mergeCookieHeader(hdrs, resolved.cookies);
    if (resolved.panelUa) hdrs = applyPanelUa(hdrs, resolved.panelUa);

    // 已有 cf_clearance：优先同指纹 panel fetch（JSON API 用 useFetch）
    if (shouldUseCfWebViewFetch(source, resolved.cookies || '')) {
      try {
        return await fetchPageHtmlViaCfWebView(source, opts.url, resolved.cookies, hdrs, {
          useFetch: true,
        });
      } catch {
        /* fall through to normal fetch */
      }
    }
    return opts.fetchOnce(hdrs);
  };

  const isBlockedBody = (text: string) => isCloudflareBlockedResponse(200, text);

  try {
    let text = await run(opts.headers);
    if (!interactive || !isBlockedBody(text)) return text;
    const { ok } = await ensureSiteAccess({
      scope,
      url: opts.url,
      title: `Cloudflare 验证 — ${opts.ieName || '下载'}`,
      source,
    });
    if (!ok) {
      throw new HttpError(403, 'Forbidden', opts.url, 'Cloudflare 验证未完成', text);
    }
    text = await run(opts.headers);
    if (isBlockedBody(text)) {
      throw new HttpError(403, 'Forbidden', opts.url, 'Cloudflare 验证后仍返回挑战页', text);
    }
    return text;
  } catch (e) {
    if (!interactive || !shouldOfferCloudflareVerification(e)) throw e;
    const blockedUrl = e instanceof HttpError ? e.url : undefined;
    const { ok } = await ensureSiteAccess({
      scope,
      url: opts.url,
      blockedUrl,
      title: `Cloudflare 验证 — ${opts.ieName || '下载'}`,
      source,
    });
    if (!ok) {
      throw e instanceof HttpError
        ? e
        : new HttpError(403, 'Forbidden', opts.url, 'Cloudflare 验证未完成');
    }
    const text = await run(opts.headers);
    if (isBlockedBody(text)) {
      throw new HttpError(403, 'Forbidden', opts.url, 'Cloudflare 验证后仍返回挑战页', text);
    }
    return text;
  }
}

/** @internal test helper */
export function _testOnlySiteSource(url: string): BookSource {
  return siteScopeAsBookSource(makeYtdlpDownloadScope(url), url);
}
