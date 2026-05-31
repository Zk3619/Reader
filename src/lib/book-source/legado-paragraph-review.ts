/**
 * 晴天聚合等书源段评：对齐 jsLib showCmt → ajax / showBrowser
 */

import type { BookSource } from '@/types';
import { get } from '@/lib/http';
import { parseShowCmtCall } from '@/lib/js-engine/legado/legado-image-options';
import {
  buildSourceRequestHeaders,
  resolveBookSourceServerUrl,
} from '@/lib/book-source/source-http';
import { getStoredSourceCookiesForUrl } from '@/lib/js-engine';
import { getSourceArgsKey, getScriptBaseUrl } from '@/lib/js-engine/legado/source-script-shared';
import { shouldUseInnerWebDocumentProxy } from '@/lib/http/inner-web-proxy-session';
import { openInnerWeb, updateInnerWebPayload } from '@/lib/platform/inner-web';
import { injectInnerWebBaseTag } from '@/lib/platform/inner-web-document-html';
import {
  INNER_WEB_PRESETS,
  createInnerWebPresentation,
} from '@/lib/platform/inner-web-presentation';
import { showAppToast } from '@/components/shared/AppToasts';

function readServerFromSourceArgs(source: BookSource): string | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(getSourceArgsKey(source));
    if (!raw) return undefined;
    const data = JSON.parse(raw) as { server?: unknown };
    if (typeof data.server === 'string' && data.server.trim()) {
      return data.server.trim().replace(/\/+$/, '');
    }
  } catch {
    /* ignore */
  }
  return (resolveBookSourceServerUrl(source) ?? getScriptBaseUrl(source)).replace(/\/+$/, '');
}

/** `/get_para_review?...` → 绝对 URL */
export function resolveParagraphReviewUrl(
  reviewPath: string,
  source: BookSource,
): string {
  const trimmed = reviewPath.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const server = (readServerFromSourceArgs(source) ?? '').replace(/\/+$/, '');
  if (!server) throw new Error('未配置聚合服务器，请先登录书源');
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${server}${path}`;
}

function looksLikeParagraphReviewHtml(body: string): boolean {
  const t = body.trim();
  if (!t) return false;
  return (
    /<!DOCTYPE/i.test(t) ||
    /<html[\s>]/i.test(t) ||
    t.includes('评论') ||
    t.includes('paragraph') ||
    t.includes('para_review')
  );
}

const LOG_TAG = '[para-review]';

/**
 * 点击段评 SVG（showCmt）→ 先开 InnerWeb 抽屉并显示占位，await 段评页请求后关闭占位
 * - 纯 Web + Cookie：InnerWebPage 走 __reader_http 代理 doc
 * - 无 Cookie / 代理不可用：预取 HTML + srcdoc
 */
export async function openParagraphReviewFromClick(
  click: string,
  source: BookSource,
): Promise<void> {
  console.log(LOG_TAG, 'click raw', click?.slice(0, 200));

  const parsed = parseShowCmtCall(click);
  if (!parsed) {
    console.warn(LOG_TAG, 'parseShowCmtCall failed', { click: click?.slice(0, 300) });
    showAppToast({ title: '无法解析段评链接', variant: 'destructive' });
    return;
  }

  let absoluteUrl: string;
  try {
    absoluteUrl = resolveParagraphReviewUrl(parsed.reviewUrl, source);
  } catch (e) {
    console.warn(LOG_TAG, 'resolve URL failed', e);
    showAppToast({
      title: e instanceof Error ? e.message : '段评 URL 无效',
      variant: 'destructive',
    });
    return;
  }

  const cookies = getStoredSourceCookiesForUrl(source, absoluteUrl);
  const title = `${parsed.sources || '段评'}段评`;
  const headers = buildSourceRequestHeaders(source, absoluteUrl);
  const useDocumentProxy = shouldUseInnerWebDocumentProxy(absoluteUrl, cookies);

  try {
    const opened = openInnerWeb({
      title,
      url: absoluteUrl,
      cookieSyncUrl: absoluteUrl,
      initialCookies: cookies,
      bookSourceUrl: source.bookSourceUrl,
      presentation: createInnerWebPresentation(INNER_WEB_PRESETS.paragraphReview),
      useProxyDocument: useDocumentProxy,
      proxyForwardHeaders: useDocumentProxy ? headers : undefined,
      loading: true,
    });
    if (!opened) {
      showAppToast({ title: '打开段评页失败', variant: 'destructive' });
      return;
    }
  } catch (e) {
    console.error(LOG_TAG, 'open inner web failed', e);
    showAppToast({ title: '打开段评页失败', variant: 'destructive' });
    return;
  }

  try {
    const body = await get(absoluteUrl, { headers });
    console.log(LOG_TAG, 'GET ok', { len: body.length, preview: body.slice(0, 120) });
    const patch: {
      loading: false;
      html?: string;
      useProxyDocument?: false;
    } = { loading: false };
    if (!useDocumentProxy) {
      patch.useProxyDocument = false;
      if (looksLikeParagraphReviewHtml(body)) {
        patch.html = injectInnerWebBaseTag(body, absoluteUrl);
      }
    }
    if (!updateInnerWebPayload(patch)) {
      console.warn(LOG_TAG, 'updateInnerWebPayload failed');
    }
  } catch (e) {
    console.warn(LOG_TAG, 'GET failed', e);
    updateInnerWebPayload({ loading: false, useProxyDocument: false });
    showAppToast({ title: '加载段评失败', variant: 'destructive' });
  }
}
