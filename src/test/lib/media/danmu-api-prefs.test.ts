import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  danmuApiPrefsToEnv,
  getDanmuApiPrefs,
  setDanmuApiPrefs,
  DEFAULT_SOURCE_ORDER,
  DEFAULT_MERGE_SOURCE_PAIRS,
  parseEnabledSources,
  parseMergeSources,
  serializeEnabledSources,
  serializeMergeSources,
} from '@/lib/media/video/danmaku/danmu-api/prefs';

describe('danmu-api prefs', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    });
  });

  it('defaults enable full source order', () => {
    const p = getDanmuApiPrefs();
    expect(p.enabled).toBe(true);
    expect(p.sourceOrder).toBe(DEFAULT_SOURCE_ORDER);
    expect(p.sourceOrder).toContain('tencent');
    expect(p.sourceOrder).toContain('bilibili');
  });

  it('defaults merge pairs to official platforms', () => {
    const p = getDanmuApiPrefs();
    expect(p.mergeSourcePairs).toBe(DEFAULT_MERGE_SOURCE_PAIRS);
    expect(parseMergeSources(p.mergeSourcePairs)).toEqual([
      'tencent',
      'youku',
      'iqiyi',
      'imgo',
      'bilibili',
      'migu',
    ]);
  });

  it('serializes enable / merge toggles without format strings', () => {
    const enabled: string[] = parseEnabledSources(DEFAULT_SOURCE_ORDER).filter(
      (id) => id === 'tencent' || id === 'bilibili',
    );
    enabled.push('unknown');
    expect(serializeEnabledSources(enabled)).toBe(
      ['tencent', 'bilibili', 'unknown'].join(','),
    );
    expect(serializeMergeSources(['migu', 'tencent', 'douban'])).toBe(
      'tencent&migu',
    );
    expect(parseMergeSources('tencent&youku,dandan&animeko')).toEqual([
      'tencent',
      'youku',
      'dandan',
      'animeko',
    ]);
  });

  it('maps prefs to env keys used by Envs.load', () => {
    setDanmuApiPrefs({
      blockedWords: '广告,刷屏',
      danmuOffset: 'overlord/S01:90',
      danmuPushUrl: 'http://127.0.0.1:9978/action?do=refresh&type=danmaku&path=',
      convertTopBottomToScroll: true,
      mergeSourcePairs: serializeMergeSources(['tencent', 'bilibili']),
    });
    const env = danmuApiPrefsToEnv();
    expect(env.BLOCKED_WORDS).toBe('广告,刷屏');
    expect(env.DANMU_OFFSET).toBe('overlord/S01:90');
    expect(env.DANMU_PUSH_URL).toContain('do=refresh');
    expect(env.CONVERT_TOP_BOTTOM_TO_SCROLL).toBe('true');
    expect(env.SOURCE_ORDER.split(',')).toContain('iqiyi');
    expect(env.MERGE_SOURCE_PAIRS).toBe('tencent&bilibili');
  });
});

describe('danmu-api engine smoke', () => {
  it(
    'Globals.init accepts reader env',
    async () => {
      const { Globals } = await import(
        '@/lib/media/video/danmaku/danmu-api/vendor-bridge'
      );
      const env = danmuApiPrefsToEnv();
      Globals.init(env);
      expect(Globals.envs.sourceOrderArr?.length).toBeGreaterThan(5);
      expect(Globals.envs.blockedWords).toBeDefined();
    },
    30_000,
  );
});
