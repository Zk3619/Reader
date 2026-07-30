import { describe, expect, it } from 'vitest';
import { resolveSubscribeFeedUrl } from '@/lib/subscribe/feed-url';

describe('subscribe feed url', () => {
  it('maps rsshub scheme to the default RSSHub instance', () => {
    expect(resolveSubscribeFeedUrl('rsshub://tophub/WnBe01o371')).toBe(
      'https://rsshub.app/tophub/WnBe01o371',
    );
  });

  it('keeps HTTP URLs unchanged', () => {
    expect(resolveSubscribeFeedUrl(' https://example.com/rss.xml ')).toBe(
      'https://example.com/rss.xml',
    );
  });

  it('rejects unsupported schemes before fetch', () => {
    expect(() => resolveSubscribeFeedUrl('file:///tmp/feed.xml')).toThrow(
      '不支持的订阅源协议',
    );
  });
});
