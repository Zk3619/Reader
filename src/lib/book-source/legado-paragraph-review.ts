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
import { openInnerWeb } from '@/lib/platform/inner-web';
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
 * 点击段评 SVG（showCmt）→ 拉取段评页并在 InnerWeb 打开（不走 Reader 段评抽屉）
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

  console.log(LOG_TAG, 'parsed', {
    reviewUrl: parsed.reviewUrl,
    sources: parsed.sources,
    ydv: parsed.ydv,
    bookSource: source.bookSourceUrl,
  });

  let absoluteUrl: string;
  try {
    absoluteUrl = resolveParagraphReviewUrl(parsed.reviewUrl, source);
    console.log(LOG_TAG, 'absoluteUrl', absoluteUrl);
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
  console.log(LOG_TAG, 'request', {
    title,
    hasCookie: Boolean(cookies?.trim()),
    headerKeys: Object.keys(headers),
  });

  let html: string | undefined;
  try {
    const body = await get(absoluteUrl, { headers });
    console.log(LOG_TAG, 'GET ok', { len: body.length, preview: body.slice(0, 120) });
    if (looksLikeParagraphReviewHtml(body)) {
      html = body;
    }
  } catch (e) {
    console.warn(LOG_TAG, 'GET failed, open URL only', e);
  }

  try {
    await openInnerWeb({
      title,
      url: absoluteUrl,
      html,
      cookieSyncUrl: absoluteUrl,
      initialCookies: cookies,
      bookSourceUrl: source.bookSourceUrl,
      showConfirm: true,
    });
    console.log(LOG_TAG, 'inner web opened');
  } catch (e) {
    console.error(LOG_TAG, 'open inner web failed', e);
    showAppToast({ title: '打开段评页失败', variant: 'destructive' });
  }
}
