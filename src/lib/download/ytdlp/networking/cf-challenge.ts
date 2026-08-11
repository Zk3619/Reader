/**
 * ytdlp HTTP × Cookie Hub CF：遇 Cloudflare 挑战时弹 InnerWeb，验证后带 clearance 重试。
 * cf_clearance 绑定 WebView 指纹时走 panel fetch（与书源 CF 管线一致）。
 *
 * 托管等待墙（Just a moment → 自动通过）常无 cf_clearance：√ 后仍须用同 panel 指纹
 * fetch，不能回落 plugin-http（会再 403）。
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
import { getCfActiveRequestOrigin } from '@/lib/book-source/source-http';
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

/** ytdlp：仅在有 cf_clearance + CF 活跃域（或 √ 后强制）时走 panel */
function shouldUseYtdlpPanelFetch(
  source: BookSource,
  cookies: string,
  forcePanel: boolean,
): boolean {
  if (forcePanel) return true;
  return shouldUseCfWebViewFetch(source, cookies);
}

/**
 * 包装一次文本拉取：403/503 CF 挑战 → ensureSiteAccess → Cookie/panel 重试。
 */
export async function fetchTextWithYtdlpCloudflareRetry(opts: {
  url: string;
  headers: Record<string, string>;
  ieName?: string;
  /** 打开验证页用的 URL（默认同 url；API 请求宜传站点页） */
  verifyUrl?: string;
  /** false 时不弹验证（无头/测试） */
  interactive?: boolean;
  fetchOnce: (headers: Record<string, string>) => Promise<string>;
}): Promise<string> {
  const interactive = opts.interactive !== false && typeof window !== 'undefined';
  const scope = makeYtdlpDownloadScope(opts.url);
  const source = siteScopeAsBookSource(scope, opts.url);
  const accessUrl = (opts.verifyUrl || opts.url).trim() || opts.url;

  const run = async (
    headers: Record<string, string>,
    forcePanel = false,
  ): Promise<string> => {
    const resolved = resolveSiteCookies(scope, opts.url, source);
    let hdrs = headers;
    if (resolved.cookies) hdrs = mergeCookieHeader(hdrs, resolved.cookies);
    if (resolved.panelUa) hdrs = applyPanelUa(hdrs, resolved.panelUa);

    const usePanel = shouldUseYtdlpPanelFetch(source, resolved.cookies || '', forcePanel);
    if (usePanel) {
      try {
        return await fetchPageHtmlViaCfWebView(source, opts.url, resolved.cookies, hdrs, {
          useFetch: true,
        });
      } catch (e) {
        // √ 后强制 panel：勿静默回落 plugin-http（指纹不一致必 403）
        if (forcePanel || getCfActiveRequestOrigin(source)) throw e;
      }
    }
    return opts.fetchOnce(hdrs);
  };

  const isBlockedBody = (text: string) => isCloudflareBlockedResponse(200, text);

  const verify = async (blockedUrl?: string) =>
    ensureSiteAccess({
      scope,
      url: accessUrl,
      blockedUrl,
      title: `Cloudflare 验证 — ${opts.ieName || '下载'}`,
      source,
    });

  try {
    let text = await run(opts.headers);
    if (!interactive || !isBlockedBody(text)) return text;
    const { ok } = await verify(opts.url);
    if (!ok) {
      throw new HttpError(403, 'Forbidden', opts.url, 'Cloudflare 验证未完成', text);
    }
    text = await run(opts.headers, true);
    if (isBlockedBody(text)) {
      throw new HttpError(403, 'Forbidden', opts.url, 'Cloudflare 验证后仍返回挑战页', text);
    }
    return text;
  } catch (e) {
    if (!interactive || !shouldOfferCloudflareVerification(e)) throw e;
    const blockedUrl = e instanceof HttpError ? e.url : undefined;
    const { ok } = await verify(blockedUrl);
    if (!ok) {
      throw e instanceof HttpError
        ? e
        : new HttpError(403, 'Forbidden', opts.url, 'Cloudflare 验证未完成');
    }
    const text = await run(opts.headers, true);
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

/** @internal test helper */
export function _testOnlyShouldUseYtdlpPanelFetch(
  source: BookSource,
  cookies: string,
  forcePanel: boolean,
): boolean {
  return shouldUseYtdlpPanelFetch(source, cookies, forcePanel);
}
