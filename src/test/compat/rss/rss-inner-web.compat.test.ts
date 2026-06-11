import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RssSource } from '@/types';

const openInnerWeb = vi.fn((_opts?: unknown) => true);
const openUrlInBrowser = vi.fn(async (_url?: string) => {});
const showAppToast = vi.fn((_msg?: unknown) => {});

vi.mock('@/lib/platform/inner-web', () => ({
  openInnerWeb: (opts: unknown) => openInnerWeb(opts),
}));

vi.mock('@/lib/platform/open-url', () => ({
  openUrlInBrowser: (url: string) => openUrlInBrowser(url),
  openExternalUrl: vi.fn(async (url: string) => url.startsWith('mailto:')),
}));

vi.mock('@/components/shared/AppToasts', () => ({
  showAppToast: (msg: unknown) => showAppToast(msg),
}));

vi.mock('@/lib/rss-source/rss-as-book-source', () => ({
  rssAsBookSource: (source: RssSource) => ({
    bookSourceUrl: source.sourceUrl,
    bookSourceName: source.sourceName,
  }),
}));

const source = {
  sourceUrl: '阅读订阅',
  sourceName: '阅读订阅',
  sourceGroup: '默认',
  sourceComment: '',
  sortUrl: '',
  articleStyle: 0,
  enabled: true,
  lastUpdateTime: 0,
  type: 0,
} as RssSource;

describe('openRssUrlInInnerWeb', () => {
  beforeEach(() => {
    openInnerWeb.mockReset().mockReturnValue(true);
    openUrlInBrowser.mockClear();
    showAppToast.mockClear();
  });

  it('http 链接优先走 inner-web', async () => {
    const { openRssUrlInInnerWeb } = await import('@/lib/rss-source/rss-inner-web');
    const result = await openRssUrlInInnerWeb(source, 'https://example.com/page', {
      title: '测试',
      onUnavailable: 'iframe',
    });
    expect(result).toBe('inner-web');
    expect(openInnerWeb).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/page',
        useProxyDocument: false,
        proxyForwardHeaders: expect.objectContaining({
          'User-Agent': expect.stringContaining('Android'),
        }),
      }),
    );
    expect(openUrlInBrowser).not.toHaveBeenCalled();
  });

  it('inner-web 不可用时 url 模式回退 iframe', async () => {
    openInnerWeb.mockReturnValue(false);
    const { openRssUrlInInnerWeb } = await import('@/lib/rss-source/rss-inner-web');
    const result = await openRssUrlInInnerWeb(source, 'https://example.com/page', {
      onUnavailable: 'iframe',
    });
    expect(result).toBe('iframe');
    expect(openUrlInBrowser).not.toHaveBeenCalled();
  });

  it('inner-web 不可用时外链回退浏览器', async () => {
    openInnerWeb.mockReturnValue(false);
    const { openRssUrlInInnerWeb } = await import('@/lib/rss-source/rss-inner-web');
    const result = await openRssUrlInInnerWeb(source, 'https://example.com/page', {
      onUnavailable: 'browser',
    });
    expect(result).toBe('browser');
    expect(openUrlInBrowser).toHaveBeenCalledWith('https://example.com/page');
    expect(showAppToast).toHaveBeenCalled();
  });

  it('非 http scheme 走系统处理程序', async () => {
    const { openRssExternalLink } = await import('@/lib/rss-source/rss-inner-web');
    const result = await openRssExternalLink(source, 'mailto:test@example.com');
    expect(result).toBe('browser');
    expect(openInnerWeb).not.toHaveBeenCalled();
  });
});
