/**
 * /sub/* 订阅模块 API 契约测试（可重复执行的请求/响应快照）
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isLegadoWebApiPath, normalizeLegadoApiPath } from '@/lib/web-api/paths';
import {
  createSubscribeSourceApi,
  deleteSubscribeSourceApi,
  exportSubscribeOpmlApi,
  getSubscribeDashboardApi,
  getSubscribeEntryApi,
  getSubscribeTimelineApi,
  importSubscribeOpmlApi,
  markAllSubscribeEntriesReadApi,
  markSubscribeEntryReadApi,
  markSubscribeEntryStarredApi,
  refreshAllSubscribeSourcesApi,
  refreshSubscribeSourceApi,
  searchSubscribeEntriesApi,
  setSubscribeSourceEnabledApi,
  updateSubscribeSourceApi,
} from '@/lib/web-api/subscribe-controller';

const mockDashboard = {
  sources: [
    {
      id: 'subsrc_abc',
      url: 'https://example.com/feed.xml',
      type: 'rss' as const,
      title: 'Example',
      category: 'News',
      enabled: true,
      lastFetchAt: null,
      metaJson: '{}',
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  feeds: [] as unknown[],
  entries: [] as unknown[],
  unreadBySource: { subsrc_abc: 2 },
  nextCursor: null,
  hasMore: false,
};

const mockEntry = {
  id: 'e1',
  feedId: 'f1',
  title: 'Hello',
  url: 'https://example.com/a',
  author: null,
  publishedAt: 1,
  read: false,
  starred: false,
  content: 'body',
  metaJson: '{}',
  createdAt: 1,
};

vi.mock('@/lib/subscribe/service', () => ({
  listSubscribeDashboard: vi.fn(async () => mockDashboard),
  createSubscribeSource: vi.fn(async () => 'subsrc_new'),
  updateSubscribeSource: vi.fn(async () => undefined),
  refreshSubscribeSource: vi.fn(async () => 3),
  refreshAllSubscribeSources: vi.fn(async () => ({
    refreshed: 1,
    entries: 3,
    failures: [],
  })),
  removeSubscribeSource: vi.fn(async () => undefined),
  searchSubscribeEntries: vi.fn(async () => []),
  getSubscribeEntry: vi.fn(async (id: string) => (id === 'e1' ? mockEntry : null)),
  markSubscribeTimelineRead: vi.fn(async () => undefined),
  updateSubscribeSourceEnabled: vi.fn(async () => undefined),
  updateSubscribeEntryRead: vi.fn(async () => undefined),
  updateSubscribeEntryStarred: vi.fn(async () => undefined),
  importSubscribeOpml: vi.fn(async () => ({
    imported: 2,
    skipped: 1,
    sourceIds: ['a', 'b', 'c'],
  })),
  exportSubscribeOpml: vi.fn(async () => '<opml version="2.0"></opml>'),
}));

const SUB_PATHS = [
  '/sub/dashboard',
  '/sub/timeline',
  '/sub/getEntry',
  '/sub/searchEntries',
  '/sub/createSource',
  '/sub/updateSource',
  '/sub/refreshSource',
  '/sub/refreshAll',
  '/sub/setSourceEnabled',
  '/sub/deleteSource',
  '/sub/markEntryRead',
  '/sub/markAllRead',
  '/sub/markEntryStarred',
  '/sub/importOpml',
  '/sub/exportOpml',
];

describe('subscribe API path registry', () => {
  it('registers /sub/* routes without legacy RSS name collision', () => {
    for (const path of SUB_PATHS) {
      expect(isLegadoWebApiPath(path)).toBe(true);
      expect(normalizeLegadoApiPath(`${path}/`)).toBe(path);
    }
    expect(isLegadoWebApiPath('/getRssSources')).toBe(true);
    expect(isLegadoWebApiPath('/saveRssSource')).toBe(true);
    expect(isLegadoWebApiPath('/refreshRssArticles')).toBe(true);
  });
});

describe('subscribe-controller contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getSubscribeDashboardApi returns dashboard shape', async () => {
    const payload = await getSubscribeDashboardApi({ unreadOnly: '0', starredOnly: '0' });
    expect(payload).toMatchObject({
      isSuccess: true,
      errorMsg: '',
      data: {
        sources: expect.any(Array),
        feeds: expect.any(Array),
        entries: expect.any(Array),
      },
    });
    expect(payload).toMatchSnapshot();
  });

  it('timeline and getEntry align with dashboard/entry payloads', async () => {
    const timeline = await getSubscribeTimelineApi({ timeline: 'unread' });
    expect(timeline.isSuccess).toBe(true);

    const missing = await getSubscribeEntryApi({});
    expect(missing.errorMsg).toBe('缺少 entryId');

    const ok = await getSubscribeEntryApi({ entryId: 'e1' });
    expect(ok).toMatchObject({ isSuccess: true, data: { id: 'e1' } });
    expect({ timeline, ok }).toMatchSnapshot();
  });

  it('searchSubscribeEntriesApi returns entry list', async () => {
    const payload = await searchSubscribeEntriesApi({ q: 'test' });
    expect(payload.isSuccess).toBe(true);
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload).toMatchSnapshot();
  });

  it('createSubscribeSourceApi validates url and returns id', async () => {
    const missing = await createSubscribeSourceApi(JSON.stringify({ title: 'No URL' }));
    expect(missing).toMatchObject({
      isSuccess: false,
      errorMsg: '缺少 url',
      data: null,
    });

    const ok = await createSubscribeSourceApi(
      JSON.stringify({ title: 'Example', url: 'https://example.com/rss.xml', category: 'News' }),
    );
    expect(ok).toMatchObject({
      isSuccess: true,
      data: { id: 'subsrc_new' },
    });
    expect(ok).toMatchSnapshot();
  });

  it('updateSubscribeSourceApi and refreshAll/markAllRead work', async () => {
    const updated = await updateSubscribeSourceApi(
      JSON.stringify({ sourceId: 'subsrc_abc', category: 'Tech' }),
    );
    expect(updated.data).toBe('已更新');

    const refreshed = await refreshAllSubscribeSourcesApi();
    expect(refreshed.data).toMatchObject({ refreshed: 1, entries: 3 });

    const marked = await markAllSubscribeEntriesReadApi(JSON.stringify({ sourceId: 'subsrc_abc' }));
    expect(marked.data).toBe('已更新');
    expect({ updated, refreshed, marked }).toMatchSnapshot();
  });

  it('refreshSubscribeSourceApi validates sourceId', async () => {
    const missing = await refreshSubscribeSourceApi('{}');
    expect(missing).toMatchObject({
      isSuccess: false,
      errorMsg: '缺少 sourceId',
    });

    const ok = await refreshSubscribeSourceApi(JSON.stringify({ sourceId: 'subsrc_abc' }));
    expect(ok).toMatchObject({
      isSuccess: true,
      data: { count: 3 },
    });
    expect(ok).toMatchSnapshot();
  });

  it('setSubscribeSourceEnabledApi and deleteSubscribeSourceApi return messages', async () => {
    const enabled = await setSubscribeSourceEnabledApi(
      JSON.stringify({ sourceId: 'subsrc_abc', enabled: false }),
    );
    expect(enabled).toMatchObject({ isSuccess: true, data: '已更新' });

    const deleted = await deleteSubscribeSourceApi(JSON.stringify({ sourceId: 'subsrc_abc' }));
    expect(deleted).toMatchObject({ isSuccess: true, data: '已删除' });
    expect({ enabled, deleted }).toMatchSnapshot();
  });

  it('mark entry read/starred validate entryId', async () => {
    const readMissing = await markSubscribeEntryReadApi('{}');
    expect(readMissing.errorMsg).toBe('缺少 entryId');

    const readOk = await markSubscribeEntryReadApi(JSON.stringify({ entryId: 'e1', read: true }));
    expect(readOk.data).toBe('已更新');

    const starOk = await markSubscribeEntryStarredApi(
      JSON.stringify({ entryId: 'e1', starred: true }),
    );
    expect(starOk.data).toBe('已更新');
    expect({ readOk, starOk }).toMatchSnapshot();
  });

  it('import/export OPML endpoints', async () => {
    const missing = await importSubscribeOpmlApi('{}');
    expect(missing.errorMsg).toBe('缺少 OPML 内容');

    const imported = await importSubscribeOpmlApi(JSON.stringify({ xml: '<opml></opml>' }));
    expect(imported.data).toMatchObject({ imported: 2, skipped: 1 });

    const exported = await exportSubscribeOpmlApi();
    expect(exported.data?.opml).toContain('opml');
    expect({ imported, exported }).toMatchSnapshot();
  });
});
