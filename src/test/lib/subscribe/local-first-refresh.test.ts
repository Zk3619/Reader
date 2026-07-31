import { beforeEach, describe, expect, it, vi } from 'vitest';

class MiniXmlDoc {
  constructor(private readonly xml: string) {}
  querySelector(selector: string): unknown {
    if (selector === 'parsererror') return null;
    if (selector === 'rss > channel') {
      const title = this.xml.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
      return {
        textContent: '',
        querySelector: (sel: string) => {
          if (sel === 'title') return { textContent: title };
          if (sel === 'description' || sel === 'link' || sel === 'subtitle') {
            return { textContent: '' };
          }
          return null;
        },
      };
    }
    if (selector === 'feed') return null;
    return null;
  }
  querySelectorAll(selector: string): Array<{
    children: Element[];
    querySelector: (sel: string) => { textContent: string; getAttribute: (n: string) => string | null } | null;
    textContent: string;
  }> {
    if (selector !== 'rss > channel > item' && selector !== 'feed > entry') return [];
    const items: Array<{
      children: Element[];
      querySelector: (sel: string) => { textContent: string; getAttribute: (n: string) => string | null } | null;
      textContent: string;
    }> = [];
    const re = /<item>([\s\S]*?)<\/item>/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(this.xml))) {
      const block = match[1]!;
      items.push({
        children: [],
        textContent: block,
        querySelector: (sel: string) => {
          const tag = sel.split('>')[0]?.trim() || sel;
          const plain =
            block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1]?.trim() ?? '';
          if (!plain) return null;
          return { textContent: plain, getAttribute: () => null };
        },
      });
    }
    return items;
  }
}

vi.stubGlobal(
  'DOMParser',
  class {
    parseFromString(xml: string) {
      return new MiniXmlDoc(xml);
    }
  },
);

const fetchFoloEntryHistory = vi.fn();
const getSubscribeConfig = vi.fn();
const getSubscribeFoloAuth = vi.fn();
const listSubSources = vi.fn();
const getSubSource = vi.fn();
const listSubEntries = vi.fn();
const listSubFeeds = vi.fn();
const upsertSubFeed = vi.fn();
const upsertSubEntry = vi.fn();
const touchSubSourceFetchTime = vi.fn();
const fetchSubscribeFeedXml = vi.fn();

vi.mock('@/lib/subscribe/folo-cloud', () => ({
  fetchFoloEntryHistory: (...args: unknown[]) => fetchFoloEntryHistory(...args),
  fetchFoloFeedByUrl: vi.fn(async () => null),
}));

vi.mock('@/lib/persistence/domains/subscribe-config', () => ({
  getSubscribeConfig: (...args: unknown[]) => getSubscribeConfig(...args),
}));

vi.mock('@/lib/persistence/domains/subscribe-folo-auth', () => ({
  getSubscribeFoloAuth: (...args: unknown[]) => getSubscribeFoloAuth(...args),
}));

vi.mock('@/lib/subscribe/fetch-subscribe-feed', () => ({
  fetchSubscribeFeedXml: (...args: unknown[]) => fetchSubscribeFeedXml(...args),
}));

vi.mock('@/lib/database/subscribe', () => ({
  listSubSources: (...args: unknown[]) => listSubSources(...args),
  getSubSource: (...args: unknown[]) => getSubSource(...args),
  getSubSourceByUrl: vi.fn(),
  listSubEntries: (...args: unknown[]) => listSubEntries(...args),
  listSubFeeds: (...args: unknown[]) => listSubFeeds(...args),
  upsertSubFeed: (...args: unknown[]) => upsertSubFeed(...args),
  upsertSubEntry: (...args: unknown[]) => upsertSubEntry(...args),
  upsertSubSource: vi.fn(),
  touchSubSourceFetchTime: (...args: unknown[]) => touchSubSourceFetchTime(...args),
  countUnreadByFeed: vi.fn(async () => new Map()),
  deleteSubEntriesByFeed: vi.fn(),
  deleteSubFeed: vi.fn(),
  deleteSubSource: vi.fn(),
  getSubEntry: vi.fn(),
  markSubEntryRead: vi.fn(),
  markSubEntryStarred: vi.fn(),
  markAllSubEntriesRead: vi.fn(),
  setSubSourceEnabled: vi.fn(),
  updateSubSourceMeta: vi.fn(),
}));

vi.mock('@/lib/database/module-search-keywords', () => ({
  upsertSubSearchKeyword: vi.fn(),
}));

import {
  pullSubscribeHistoryFromCloud,
  refreshSubscribeSource,
} from '@/lib/subscribe/service';

const SAMPLE_RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Demo</title>
  <item>
    <title>A</title>
    <link>https://example.com/a</link>
    <guid>https://example.com/a</guid>
    <description>hi</description>
  </item>
</channel></rss>`;

describe('local-first subscribe refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSubscribeConfig.mockResolvedValue({ foloCloudAccountEnabled: false });
    getSubscribeFoloAuth.mockResolvedValue({ sessionToken: '' });
    listSubSources.mockResolvedValue([
      {
        id: 'subsrc_1',
        title: 'Demo',
        url: 'https://example.com/feed.xml',
        type: 'rss',
        category: null,
        enabled: true,
        lastFetchAt: null,
        metaJson: '{}',
        createdAt: 1,
      },
    ]);
    getSubSource.mockResolvedValue({
      id: 'subsrc_1',
      title: 'Demo',
      url: 'https://example.com/feed.xml',
      type: 'rss',
      category: null,
      enabled: true,
      lastFetchAt: null,
      metaJson: '{}',
      createdAt: 1,
    });
    listSubFeeds.mockResolvedValue([]);
    listSubEntries.mockResolvedValue([]);
    upsertSubFeed.mockResolvedValue(undefined);
    upsertSubEntry.mockResolvedValue(undefined);
    touchSubSourceFetchTime.mockResolvedValue(undefined);
    fetchSubscribeFeedXml.mockResolvedValue(SAMPLE_RSS);
  });

  it('refreshSubscribeSource only uses local RSS and never pulls cloud history', async () => {
    const result = await refreshSubscribeSource('subsrc_1');
    expect(result.count).toBe(1);
    expect(result.warning).toBeUndefined();
    expect(fetchSubscribeFeedXml).toHaveBeenCalledTimes(1);
    expect(fetchFoloEntryHistory).not.toHaveBeenCalled();
    expect(touchSubSourceFetchTime).toHaveBeenCalledTimes(1);
  });

  it('refreshSubscribeSource soft-degrades when RSS fails but local cache exists', async () => {
    fetchSubscribeFeedXml.mockRejectedValueOnce(new Error('订阅源返回内容不是有效 RSS/Atom'));
    listSubEntries.mockResolvedValueOnce([
      {
        id: 'e1',
        feedId: 'f1',
        title: 'cached',
        url: 'https://example.com/a',
        author: null,
        publishedAt: 1,
        read: false,
        starred: false,
        content: null,
        metaJson: '{}',
        createdAt: 1,
      },
    ]);

    const result = await refreshSubscribeSource('subsrc_1');
    expect(result.count).toBe(0);
    expect(result.warning).toMatch(/仍显示本地缓存/);
    expect(fetchFoloEntryHistory).not.toHaveBeenCalled();
    expect(touchSubSourceFetchTime).not.toHaveBeenCalled();
  });

  it('pullSubscribeHistoryFromCloud returns 0 when experiment switch is off', async () => {
    getSubscribeConfig.mockResolvedValue({ foloCloudAccountEnabled: false });
    getSubscribeFoloAuth.mockResolvedValue({ sessionToken: 'token' });
    const result = await pullSubscribeHistoryFromCloud('subsrc_1');
    expect(result).toEqual({ imported: 0, exhausted: false, nextCursor: null });
    expect(fetchFoloEntryHistory).not.toHaveBeenCalled();
  });

  it('pullSubscribeHistoryFromCloud returns 0 when not logged in', async () => {
    getSubscribeConfig.mockResolvedValue({ foloCloudAccountEnabled: true });
    getSubscribeFoloAuth.mockResolvedValue({ sessionToken: '' });
    const result = await pullSubscribeHistoryFromCloud('subsrc_1');
    expect(result).toEqual({ imported: 0, exhausted: false, nextCursor: null });
    expect(fetchFoloEntryHistory).not.toHaveBeenCalled();
  });
});
