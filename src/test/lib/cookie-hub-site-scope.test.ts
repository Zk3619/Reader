import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookSource } from '@/types';

vi.mock('@/lib/book-source/source-http', () => ({
  resolveSourceCookiesForHttp: vi.fn(() => 'cf_clearance=abc'),
  getCfActiveRequestOrigin: vi.fn(() => 'https://rsshub.app'),
  getCfActiveUserAgent: vi.fn(() => 'Mozilla/5.0'),
  setCfActiveRequestOrigin: vi.fn(),
  setCfActiveUserAgent: vi.fn(),
}));

vi.mock('@/lib/book-source/source-cookie-pool', () => ({
  persistSourceCookieHeaderForPage: vi.fn(),
  mirrorSourceCookiesToHttpJar: vi.fn(async () => undefined),
}));

vi.mock('@/lib/http/cloudflare-verification', () => ({
  isCloudflareBlockedResponse: vi.fn(
    (_status: number, body: string) => body.includes('Just a moment'),
  ),
  resolveCloudflareViaInnerWeb: vi.fn(async () => true),
  shouldOfferCloudflareVerification: vi.fn(
    (e: unknown) =>
      e instanceof Error && 'status' in e && (e as { status: number }).status === 403,
  ),
}));

import { HttpError } from '@/lib/http';
import { resolveCloudflareViaInnerWeb } from '@/lib/http/cloudflare-verification';
import { persistSourceCookieHeaderForPage } from '@/lib/book-source/source-cookie-pool';
import {
  bookSourceToSiteScope,
  describeCookieSource,
  ensureSiteAccess,
  makeSubscribeScope,
  publishSiteCookies,
  resolveSiteCookies,
  siteScopeAsBookSource,
  subscribeSiteScopeKey,
  withSiteChallengeRetry,
} from '@/lib/cookie-hub';

describe('cookie-hub site scope', () => {
  it('subscribe scope key isolates by origin suffix', () => {
    expect(subscribeSiteScopeKey('https://rsshub.app/tophub/x')).toBe(
      'https://rsshub.app/#reader-subscribe',
    );
    expect(makeSubscribeScope('https://rsshub.app/a').scopeKey).toBe(
      'https://rsshub.app/#reader-subscribe',
    );
  });

  it('bookSourceToSiteScope uses bookSourceUrl', () => {
    const source = {
      bookSourceUrl: 'https://a.test/source',
      sourceUrl: 'https://a.test/',
    } as BookSource;
    expect(bookSourceToSiteScope(source)).toEqual({
      module: 'reader',
      scopeKey: 'https://a.test/source',
    });
  });

  it('siteScopeAsBookSource keeps subscribe scopeKey as bookSourceUrl', () => {
    const scope = makeSubscribeScope('https://rsshub.app/feed');
    const source = siteScopeAsBookSource(scope, 'https://rsshub.app/feed');
    expect(source.bookSourceUrl).toBe('https://rsshub.app/#reader-subscribe');
    expect(source.sourceUrl).toBe('https://rsshub.app');
    expect(source.enabledCookieJar).toBe(true);
  });

  it('resolveSiteCookies reads pool via adapter', () => {
    const scope = makeSubscribeScope('https://rsshub.app/x');
    const resolved = resolveSiteCookies(scope, 'https://rsshub.app/x');
    expect(resolved.cookies).toContain('cf_clearance');
    expect(resolved.source).toBe('site-pool');
    expect(resolved.cfOrigin).toBe('https://rsshub.app');
  });

  it('publishSiteCookies writes pool and jar', async () => {
    const scope = makeSubscribeScope('https://rsshub.app/x');
    await publishSiteCookies(scope, 'https://rsshub.app/x', 'a=1');
    expect(persistSourceCookieHeaderForPage).toHaveBeenCalled();
  });

  it('describeCookieSource includes site-pool', () => {
    expect(describeCookieSource('site-pool')).toContain('书源');
  });
});

describe('cookie-hub challenge orchestration', () => {
  beforeEach(() => {
    vi.mocked(resolveCloudflareViaInnerWeb).mockClear();
  });

  it('ensureSiteAccess opens InnerWeb via scope', async () => {
    const scope = makeSubscribeScope('https://rsshub.app/x');
    const result = await ensureSiteAccess({
      scope,
      url: 'https://rsshub.app/x',
      title: 'CF',
    });
    expect(result.ok).toBe(true);
    expect(resolveCloudflareViaInnerWeb).toHaveBeenCalledTimes(1);
  });

  it('withSiteChallengeRetry verifies then retries on 403', async () => {
    const scope = makeSubscribeScope('https://rsshub.app/x');
    const fetchOnce = vi
      .fn()
      .mockRejectedValueOnce(new HttpError(403, 'Forbidden', 'https://rsshub.app/x', 'blocked', '<html>Just a moment</html>'))
      .mockResolvedValueOnce('<rss>ok</rss>');

    // shouldOfferCloudflareVerification mocked to check status===403
    const body = await withSiteChallengeRetry({
      scope,
      url: 'https://rsshub.app/x',
      fetchOnce,
    });

    expect(body).toBe('<rss>ok</rss>');
    expect(resolveCloudflareViaInnerWeb).toHaveBeenCalledTimes(1);
    expect(fetchOnce).toHaveBeenCalledTimes(2);
  });

  it('withSiteChallengeRetry detects challenge html on 200', async () => {
    const scope = makeSubscribeScope('https://rsshub.app/x');
    const fetchOnce = vi
      .fn()
      .mockResolvedValueOnce('<html>Just a moment</html>')
      .mockResolvedValueOnce('<rss>ok</rss>');

    const body = await withSiteChallengeRetry({
      scope,
      url: 'https://rsshub.app/x',
      fetchOnce,
    });

    expect(body).toBe('<rss>ok</rss>');
    expect(resolveCloudflareViaInnerWeb).toHaveBeenCalledTimes(1);
  });
});
