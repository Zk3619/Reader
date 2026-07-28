import { describe, expect, it } from 'vitest';
import {
  ARTPLAYER_DANMAKU_MARGIN_OPTION,
  ARTPLAYER_DANMAKU_SPEED_OPTION,
  marginToDanmakuArea,
  nearestDanmakuAreaStep,
  nearestDanmakuSpeedStep,
  resolveDanmakuAntiOverlap,
  resolveEffectiveDanmakuDensity,
  type DanmakuPrefs,
} from '@/lib/media/video/danmaku/danmaku-prefs';

describe('danmaku speed steps', () => {
  it('snaps within official [1~10], 极慢=10', () => {
    expect(nearestDanmakuSpeedStep(10).name).toBe('极慢');
    expect(nearestDanmakuSpeedStep(10).value).toBe(10);
    expect(nearestDanmakuSpeedStep(5).name).toBe('适中');
    expect(nearestDanmakuSpeedStep(1).name).toBe('极快');
    expect(nearestDanmakuSpeedStep(15).value).toBe(10);
    expect(nearestDanmakuSpeedStep(6).value).toBe(5);
  });

  it('SPEED option values stay unique and ≤10', () => {
    const values = ARTPLAYER_DANMAKU_SPEED_OPTION.steps.map((s) => s.value);
    expect(new Set(values).size).toBe(5);
    expect(Math.max(...values)).toBe(10);
    expect(Math.min(...values)).toBe(1);
  });
});

describe('danmaku area steps', () => {
  it('has five percentage steps', () => {
    expect(ARTPLAYER_DANMAKU_MARGIN_OPTION.steps.map((s) => s.name)).toEqual([
      '10%',
      '25%',
      '50%',
      '75%',
      '100%',
    ]);
    expect(nearestDanmakuAreaStep(1).label).toBe('100%');
    expect(nearestDanmakuAreaStep(0.1).label).toBe('10%');
    expect(nearestDanmakuAreaStep(0.3).label).toBe('25%');
  });

  it('maps margin to area with loose number/string equality', () => {
    expect(marginToDanmakuArea([10, '25%'])).toBe(0.75);
    expect(marginToDanmakuArea(['10', '25%'])).toBe(0.75);
    expect(marginToDanmakuArea([10, 10])).toBe(1);
    expect(marginToDanmakuArea(['10', '10'])).toBe(1);
  });
});

describe('danmaku density and antiOverlap are independent', () => {
  it('keeps antiOverlap false even on non-full area', () => {
    const prefs = {
      danmakuArea: 0.5,
      danmakuDensity: 'more',
      danmakuAntiOverlap: false,
    } as DanmakuPrefs;
    expect(resolveEffectiveDanmakuDensity(prefs)).toBe('more');
    expect(resolveDanmakuAntiOverlap(prefs)).toBe(false);
  });

  it('maps less/normal/more with antiOverlap true', () => {
    for (const d of ['less', 'normal', 'more'] as const) {
      expect(
        resolveDanmakuAntiOverlap({
          danmakuDensity: d,
          danmakuArea: 0.5,
          danmakuAntiOverlap: true,
        } as DanmakuPrefs),
      ).toBe(true);
    }
  });
});
