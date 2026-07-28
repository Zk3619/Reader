import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/media/video/danmaku/normalize-vod-title', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/media/video/danmaku/normalize-vod-title')
  >('@/lib/media/video/danmaku/normalize-vod-title');
  return {
    ...actual,
    getDanmakuMatchOverride: vi.fn(),
  };
});

vi.mock('@/lib/media/video/danmaku/danmu-api/prefs', () => ({
  getDanmuApiPrefs: () => ({
    recognitionRules: '',
    enabled: true,
    dedupeEnabled: false,
    danmuLimit: 0,
  }),
}));

import { getDanmakuMatchOverride } from '@/lib/media/video/danmaku/normalize-vod-title';
import { prepareDanmakuMatchQuery } from '@/lib/media/video/danmaku/match';

describe('prepareDanmakuMatchQuery episode cache key', () => {
  beforeEach(() => {
    vi.mocked(getDanmakuMatchOverride).mockReset();
  });

  it('uses current episodeIndex even if sticky override has another episodeNo', () => {
    vi.mocked(getDanmakuMatchOverride).mockReturnValue({
      title: '遮天',
      episodeNo: 1,
      skipClean: true,
    });
    const q = prepareDanmakuMatchQuery({
      fileNameHint: '遮天 第02集',
      animeTitle: '遮天',
      episodeName: '第02集',
      episodeIndex: 1,
      vodId: '123',
      siteKey: 'demo',
    });
    expect(q.episode).toBe(2);
    expect(q.vodKey).toContain('id:123');
  });

  it('different episodeIndex yields different episode for cache', () => {
    vi.mocked(getDanmakuMatchOverride).mockReturnValue(null);
    const a = prepareDanmakuMatchQuery({
      fileNameHint: '遮天',
      animeTitle: '遮天',
      episodeName: '正片',
      episodeIndex: 0,
      vodId: '123',
      siteKey: 'demo',
    });
    const b = prepareDanmakuMatchQuery({
      fileNameHint: '遮天',
      animeTitle: '遮天',
      episodeName: '正片',
      episodeIndex: 1,
      vodId: '123',
      siteKey: 'demo',
    });
    expect(a.episode).toBe(1);
    expect(b.episode).toBe(2);
    expect(a.vodKey).toBe(b.vodKey);
  });
});
