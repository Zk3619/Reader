/**
 * /sub/* 订阅模块 API 契约测试（可重复执行的请求/响应快照）
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isLegadoWebApiPath, normalizeLegadoApiPath } from '@/lib/web-api/paths';
import {
  createSubscribeSourceApi,
  deleteSubscribeSourceApi,
  getSubscribeDashboardApi,
  markSubscribeEntryReadApi,
  markSubscribeEntryStarredApi,
  refreshSubscribeSourceApi,
  searchSubscribeEntriesApi,
  setSubscribeSourceEnabledApi,
} from '@/lib/web-api/subscribe-controller';

const mockDashboard = {
  sources: [
    {
      id: 'subsrc_abc',
      url: 'https://example.com/feed.xml',
      type: 'rss' as const,
      title: 'Example',
      enabled: true,
      lastFetchAt: null,
      metaJson: '{}',
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  feeds: [] as unknown[],
  entries: [] as unknown[],
};

vi.mock('@/lib/subscribe/service', () => ({
  listSubscribeDashboard: vi.fn(async () => mockDashboard),
  createSubscribeSource: vi.fn(async () => 'subsrc_new'),
  refreshSubscribeSource: vi.fn(async () => 3),
  removeSubscribeSource: vi.fn(async () => undefined),
  searchSubscribeEntries: vi.fn(async () => []),
  updateSubscribeSourceEnabled: vi.fn(async () => undefined),
  updateSubscribeEntryRead: vi.fn(async () => undefined),
  updateSubscribeEntryStarred: vi.fn(async () => undefined),
}));

describe('subscribe API path registry', () => {
  it('registers /sub/* routes without legacy RSS name collision', () => {
    const subPaths = [
      '/sub/dashboard',
      '/sub/searchEntries',
      '/sub/createSource',
      '/sub/refreshSource',
      '/sub/setSourceEnabled',
      '/sub/deleteSource',
      '/sub/markEntryRead',
      '/sub/markEntryStarred',
    ];
    for (const path of subPaths) {
      expect(isLegadoWebApiPath(path)).toBe(true);
      expect(normalizeLegadoApiPath(`${path}/`)).toBe(path);
    }
    // legacy RSS 契约保持可识别
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
      JSON.stringify({ title: 'Example', url: 'https://example.com/rss.xml' }),
    );
    expect(ok).toMatchObject({
      isSuccess: true,
      data: { id: 'subsrc_new' },
    });
    expect(ok).toMatchSnapshot();
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
});
