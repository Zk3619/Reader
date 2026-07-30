import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookSource } from '@/types';

vi.mock('@/lib/book-source/source-http-cf', () => ({
  getBookSourcePage: vi.fn(),
}));

import { getBookSourcePage } from '@/lib/book-source/source-http-cf';
import {
  fetchSubscribeFeedXml,
  subscribeFeedAsBookSource,
} from '@/lib/subscribe/fetch-subscribe-feed';

describe('fetch-subscribe-feed', () => {
  beforeEach(() => {
    vi.mocked(getBookSourcePage).mockReset();
  });

  it('builds a cookie-jar BookSource scoped to subscribe hub key', () => {
    const source = subscribeFeedAsBookSource(
      'https://rsshub.app/tophub/WnBe01o371',
      '热榜',
    );
    expect(source.sourceUrl).toBe('https://rsshub.app');
    expect(source.bookSourceUrl).toBe('https://rsshub.app/#reader-subscribe');
    expect(source.enabledCookieJar).toBe(true);
    expect(source.sourceName).toBe('热榜');
  });

  it('resolves rsshub:// and fetches via CF-aware book-source path', async () => {
    vi.mocked(getBookSourcePage).mockResolvedValueOnce('<rss></rss>');

    const body = await fetchSubscribeFeedXml('rsshub://tophub/WnBe01o371', {
      title: '热榜',
    });

    expect(body).toBe('<rss></rss>');
    expect(getBookSourcePage).toHaveBeenCalledTimes(1);
    const [source, url, opts] = vi.mocked(getBookSourcePage).mock.calls[0] as [
      BookSource,
      string,
      {
        enableCookieJar?: boolean;
        preferDirectHttp?: boolean;
        skipCf?: boolean;
        headers?: Record<string, string>;
      },
    ];
    expect(url).toBe('https://rsshub.app/tophub/WnBe01o371');
    expect(source.bookSourceUrl).toBe('https://rsshub.app/#reader-subscribe');
    expect(source.enabledCookieJar).toBe(true);
    expect(opts.enableCookieJar).toBe(true);
    expect(opts.preferDirectHttp).toBe(false);
    expect(opts.skipCf).toBe(false);
    expect(opts.headers?.Accept).toMatch(/rss\+xml/);
  });

  it('disables interactive CF during batch refresh', async () => {
    vi.mocked(getBookSourcePage).mockResolvedValueOnce('<rss></rss>');
    await fetchSubscribeFeedXml('https://example.com/feed.xml', {
      interactiveCf: false,
    });
    const opts = vi.mocked(getBookSourcePage).mock.calls[0]?.[2] as {
      skipCf?: boolean;
      preferDirectHttp?: boolean;
    };
    expect(opts.skipCf).toBe(true);
    expect(opts.preferDirectHttp).toBe(false);
  });
});
