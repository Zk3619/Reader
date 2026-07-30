/**
 * 订阅 Feed 拉取：经 Cookie Hub SiteScope + 书源 CF 编排（getBookSourcePage）。
 * 不触碰 legado RSS 表与路由。
 */

import { getBookSourcePage } from '@/lib/book-source/source-http-cf';
import {
  makeSubscribeScope,
  siteScopeAsBookSource,
} from '@/lib/cookie-hub';
import { resolveSubscribeFeedUrl } from '@/lib/subscribe/feed-url';

const FEED_ACCEPT =
  'application/rss+xml, application/atom+xml, application/xml, text/xml, */*';

/**
 * 拉取订阅 Feed XML/HTML。
 * 遇 Cloudflare「Just a moment」时走 Cookie Hub → InnerWeb 验证后重试。
 */
export async function fetchSubscribeFeedXml(
  url: string,
  options?: { title?: string; interactiveCf?: boolean },
): Promise<string> {
  const resolvedUrl = resolveSubscribeFeedUrl(url);
  const scope = makeSubscribeScope(resolvedUrl);
  const source = siteScopeAsBookSource(scope, resolvedUrl);
  if (options?.title?.trim()) {
    source.sourceName = options.title.trim();
    source.bookSourceName = options.title.trim();
  }
  return getBookSourcePage(source, resolvedUrl, {
    timeout: options?.interactiveCf === false ? 15_000 : 45_000,
    enableCookieJar: true,
    // 批量刷新不弹逐源 CF 验证；失败应快速返回。手动刷新才允许交互验证。
    skipCf: options?.interactiveCf === false,
    // cf_clearance 绑定 WebView 指纹；已有有效 clearance 时必须复用 panel，
    // 否则 plugin-http 直连仍会 403，并错误地再次弹出挑战。
    preferDirectHttp: false,
    cfTitle: `Cloudflare 验证 — ${source.sourceName}`,
    // RSS/Atom：panel 内 fetch，避免 XML 导航空白页导致「空正文」
    cfUseFetch: true,
    cfPanelWait: {
      selector: 'rss, feed, channel, item, entry',
      minCount: 1,
      timeoutMs: 12_000,
    },
    headers: {
      Accept: FEED_ACCEPT,
    },
  });
}

/** @deprecated 使用 makeSubscribeScope + siteScopeAsBookSource */
export function subscribeFeedAsBookSource(feedUrl: string, title?: string) {
  const resolved = (() => {
    try {
      return resolveSubscribeFeedUrl(feedUrl);
    } catch {
      return feedUrl.trim();
    }
  })();
  const scope = makeSubscribeScope(resolved);
  const source = siteScopeAsBookSource(scope, resolved);
  if (title?.trim()) {
    source.sourceName = title.trim();
    source.bookSourceName = title.trim();
  }
  return source;
}
