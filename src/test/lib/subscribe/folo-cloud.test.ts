import { describe, expect, it } from 'vitest';

import {
  FOLO_RSSHUB_CATEGORIES,
  foloAvatarFallbackUrl,
  foloFeedToSubscribeUrl,
  foloRouteExampleToSubscribeUrl,
  foloSiteIconUrl,
  unwrapFoloEnvelope,
} from '@/lib/subscribe/folo-cloud';
import {
  collectFoloFeedSubscriptions,
  normalizeFoloSessionToken,
  resolveFoloLoginUrl,
} from '@/lib/subscribe/folo-account';

describe('folo-cloud helpers', () => {
  it('keeps https feed urls', () => {
    expect(foloFeedToSubscribeUrl({ url: 'https://rss.huxiu.com/' })).toBe(
      'https://rss.huxiu.com/',
    );
  });

  it('keeps rsshub feed urls', () => {
    expect(foloFeedToSubscribeUrl({ url: 'rsshub://github/trending/daily' })).toBe(
      'rsshub://github/trending/daily',
    );
  });

  it('converts route examples to rsshub urls', () => {
    expect(foloRouteExampleToSubscribeUrl('/163/ds/abc')).toBe('rsshub://163/ds/abc');
    expect(foloRouteExampleToSubscribeUrl('rsshub://github/issue/1')).toBe(
      'rsshub://github/issue/1',
    );
    expect(foloRouteExampleToSubscribeUrl('https://rsshub.app/github/repos')).toBe(
      'https://rsshub.app/github/repos',
    );
  });

  it('builds folo site icon urls like the official client', () => {
    expect(foloSiteIconUrl('https://www.huxiu.com/article/1')).toBe(
      'https://icons.folo.is/www.huxiu.com',
    );
    expect(foloAvatarFallbackUrl('https://www.huxiu.com')).toContain('avatar.vercel.sh');
    expect(FOLO_RSSHUB_CATEGORIES).toContain('social-media');
  });

  it('unwraps envelopes with or without code', () => {
    expect(unwrapFoloEnvelope({ code: 0, data: { a: 1 } })).toEqual({ a: 1 });
    expect(unwrapFoloEnvelope({ data: { routes: {} } })).toEqual({ routes: {} });
    expect(() => unwrapFoloEnvelope({ code: 1000, message: 'Unauthorized' })).toThrow(
      /Unauthorized/,
    );
  });
});

describe('folo-account helpers', () => {
  it('builds cli-compatible login urls', () => {
    const url = resolveFoloLoginUrl('http://127.0.0.1:12345/callback');
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://app.folo.is');
    expect(parsed.pathname).toBe('/login');
    expect(parsed.searchParams.get('cli_callback')).toBe('http://127.0.0.1:12345/callback');
  });

  it('normalizes percent-encoded tokens', () => {
    expect(normalizeFoloSessionToken('abc%2Edef')).toBe('abc.def');
    expect(normalizeFoloSessionToken(' plain ')).toBe('plain');
  });

  it('collects only feed subscriptions with urls', () => {
    const rows = collectFoloFeedSubscriptions([
      {
        category: '科技',
        title: '虎嗅',
        view: 1,
        feedId: 'feed-1',
        feeds: { id: 'feed-1', url: 'https://rss.huxiu.com/', title: '虎嗅' },
      },
      {
        category: '列表',
        lists: { id: 'list-1' },
      },
      {
        feeds: { url: 'https://rss.huxiu.com/', title: '重复' },
      },
      {
        feeds: { id: 'feed-2', url: 'rsshub://wechat/mp', title: '微信' },
      },
    ]);
    expect(rows).toEqual([
      {
        category: '科技',
        title: '虎嗅',
        url: 'https://rss.huxiu.com/',
        view: 1,
        foloFeedId: 'feed-1',
        siteUrl: null,
        iconUrl: null,
      },
      {
        category: 'Folo 云同步',
        title: '微信',
        url: 'rsshub://wechat/mp',
        view: 0,
        foloFeedId: 'feed-2',
        siteUrl: null,
        iconUrl: null,
      },
    ]);
  });
});
