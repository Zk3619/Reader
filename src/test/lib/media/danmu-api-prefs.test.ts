import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  danmuApiPrefsToEnv,
  getDanmuApiPrefs,
  setDanmuApiPrefs,
  DEFAULT_SOURCE_ORDER,
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

  it('maps prefs to env keys used by Envs.load', () => {
    setDanmuApiPrefs({
      blockedWords: '广告,刷屏',
      danmuOffset: 'overlord/S01:90',
      danmuPushUrl: 'http://127.0.0.1:9978/action?do=refresh&type=danmaku&path=',
      convertTopBottomToScroll: true,
    });
    const env = danmuApiPrefsToEnv();
    expect(env.BLOCKED_WORDS).toBe('广告,刷屏');
    expect(env.DANMU_OFFSET).toBe('overlord/S01:90');
    expect(env.DANMU_PUSH_URL).toContain('do=refresh');
    expect(env.CONVERT_TOP_BOTTOM_TO_SCROLL).toBe('true');
    expect(env.SOURCE_ORDER.split(',')).toContain('iqiyi');
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
