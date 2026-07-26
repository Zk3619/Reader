/**
 * 番剧播放进度写入：必须落到 bangumiHistoryKey，而非残留 hub.siteKey 幽灵行
 */
import { describe, expect, it } from 'vitest';
import {
  bangumiHistoryKey,
  isBangumiHistoryGhostRow,
  resolveBangumiPlayHistoryWrite,
} from '@/lib/media/video/bangumi/dao-bridge';

describe('resolveBangumiPlayHistoryWrite', () => {
  it('routes bangumi vod to bangumiHistoryKey and names the hub ghost key', () => {
    const epUrl = 'https://www.gugu3.com/ep/1.html';
    const target = resolveBangumiPlayHistoryWrite({
      hubSiteKey: 'mahou_app',
      vodSiteKey: 'bangumi',
      vodId: 'bangumi:501963',
      episodeUrl: epUrl,
    });
    expect(target).toEqual({
      mode: 'bangumi',
      bgmId: 501963,
      key: bangumiHistoryKey(501963, epUrl),
      siteKey: 'bangumi',
      vodId: '501963',
      ghostKey: 'mahou_app$bangumi:501963',
    });
  });

  it('detects bangumi via vodId even when hub siteKey is a residual vod site', () => {
    const target = resolveBangumiPlayHistoryWrite({
      hubSiteKey: 'mahou_app',
      vodSiteKey: undefined,
      vodId: 'bangumi:42',
      episodeUrl: '',
    });
    expect(target?.mode).toBe('bangumi');
    expect(target?.key).toBe(bangumiHistoryKey(42));
    expect(target?.ghostKey).toBe('mahou_app$bangumi:42');
  });

  it('returns null for normal vod plays', () => {
    expect(
      resolveBangumiPlayHistoryWrite({
        hubSiteKey: 'mahou_app',
        vodSiteKey: 'mahou_app',
        vodId: '12345',
        episodeUrl: 'http://x',
      }),
    ).toBeNull();
  });
});

describe('isBangumiHistoryGhostRow', () => {
  it('flags residual-site rows that store bangumi: vodId', () => {
    expect(
      isBangumiHistoryGhostRow({
        key: 'mahou_app$bangumi:501963',
        siteKey: 'mahou_app',
        vodId: 'bangumi:501963',
      }),
    ).toBe(true);
    expect(
      isBangumiHistoryGhostRow({
        key: bangumiHistoryKey(501963, 'https://ep'),
        siteKey: 'bangumi',
        vodId: '501963',
      }),
    ).toBe(false);
  });
});
