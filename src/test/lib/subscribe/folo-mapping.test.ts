import { describe, expect, it } from 'vitest';
import {
  mapFoloEntryToSubEntry,
  mapFoloFeedToSubFeed,
  mapFoloSubscriptionToSubSource,
} from '@/lib/subscribe/folo-mapping';

describe('folo-mapping', () => {
  it('maps subscription to sub source', () => {
    const mapped = mapFoloSubscriptionToSubSource({
      id: 's1',
      url: 'https://example.com/rss.xml',
      title: 'Example',
      type: 'rss',
      disabled: false,
    });
    expect(mapped.id).toBe('s1');
    expect(mapped.url).toBe('https://example.com/rss.xml');
    expect(mapped.enabled).toBe(true);
    expect(mapped.type).toBe('rss');
    expect(mapped.category).toBe('');
  });

  it('maps feed and entry with defaults', () => {
    const feed = mapFoloFeedToSubFeed({
      id: 'f1',
      subscriptionId: 's1',
      feedUrl: 'https://example.com/rss.xml',
    });
    expect(feed.sourceId).toBe('s1');
    expect(feed.title).toContain('example.com');

    const entry = mapFoloEntryToSubEntry({
      id: 'e1',
      feedId: 'f1',
      publishedAt: '2026-01-01T00:00:00Z',
    });
    expect(entry.feedId).toBe('f1');
    expect(entry.read).toBe(false);
    expect(entry.starred).toBe(false);
    expect(typeof entry.publishedAt).toBe('number');
  });
});
