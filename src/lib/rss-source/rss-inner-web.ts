/**
 * RSS 外链：优先走应用内嵌页（InnerWeb），对齐书源 startBrowser / 登录页体验。
 */

import { showAppToast } from '@/components/shared/AppToasts';
import { handleReaderImportDeepLink, isReaderImportDeepLink } from '@/lib/platform/legado-import-uri';
import { openInnerWeb } from '@/lib/platform/inner-web';
import { LEGADO_RSS_MOBILE_UA } from '@/lib/platform/inner-web-navigation';
import { openExternalUrl, openUrlInBrowser } from '@/lib/platform/open-url';
import { rssAsBookSource } from '@/lib/rss-source/rss-as-book-source';
import type { RssSource } from '@/types';

export interface OpenRssUrlInInnerWebOptions {
  title?: string;
  cookies?: string;
  headers?: Record<string, string>;
  showConfirm?: boolean;
  /** inner-web 不可用时：iframe=由 RSS WebView 加载；browser=系统浏览器 */
  onUnavailable?: 'iframe' | 'browser';
}

export type OpenRssUrlInInnerWebResult = 'inner-web' | 'iframe' | 'browser' | 'skipped';

function resolveRssInnerWebHeaders(headers?: Record<string, string>): Record<string, string> {
  const out = { ...(headers ?? {}) };
  if (!out['User-Agent'] && !out['user-agent']) {
    out['User-Agent'] = LEGADO_RSS_MOBILE_UA;
  }
  return out;
}

/** http(s) 外链在内嵌页打开；失败时按 onUnavailable 回退 */
export async function openRssUrlInInnerWeb(
  source: RssSource,
  url: string,
  options?: OpenRssUrlInInnerWebOptions,
): Promise<OpenRssUrlInInnerWebResult> {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return 'skipped';

  const book = rssAsBookSource(source);
  const bookSourceUrl = book.bookSourceUrl ?? source.sourceUrl;
  const title = options?.title?.trim() || '网页';
  const cookies = options?.cookies?.trim() ?? '';
  const headers = resolveRssInnerWebHeaders(options?.headers);
  const onUnavailable = options?.onUnavailable ?? 'browser';

  const opened = openInnerWeb({
    title,
    url: trimmed,
    showConfirm: options?.showConfirm,
    cookieSyncUrl: trimmed,
    initialCookies: cookies || undefined,
    bookSourceUrl,
    proxyForwardHeaders: headers,
    /** 始终走文档代理以注入页内链接导航（对齐 Legado WebView 内 http 跳转） */
    useProxyDocument: true,
  });

  if (opened) return 'inner-web';

  if (onUnavailable === 'iframe') {
    return 'iframe';
  }

  await openUrlInBrowser(trimmed);
  showAppToast({ title: '内嵌页不可用，已在浏览器中打开' });
  return 'browser';
}

/**
 * 正文内外链统一入口：http(s) 走 InnerWeb；其它 scheme 走系统处理程序
 */
export async function openRssExternalLink(
  source: RssSource,
  url: string,
  options?: OpenRssUrlInInnerWebOptions,
): Promise<OpenRssUrlInInnerWebResult> {
  const trimmed = url.trim();
  if (!trimmed) return 'skipped';

  if (/^https?:\/\//i.test(trimmed)) {
    return openRssUrlInInnerWeb(source, trimmed, {
      ...options,
      onUnavailable: options?.onUnavailable ?? 'browser',
    });
  }

  if (isReaderImportDeepLink(trimmed)) {
    await handleReaderImportDeepLink(trimmed);
    return 'skipped';
  }

  const opened = await openExternalUrl(trimmed);
  if (opened) return 'browser';

  showAppToast({ title: '无法打开链接', variant: 'destructive' });
  return 'skipped';
}
