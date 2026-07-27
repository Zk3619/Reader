import { describe, expect, it } from 'vitest';
import {
  ARTPLAYER_DANMAKU_SPEED_OPTION,
  nearestDanmakuSpeedStep,
} from '@/lib/media/video/danmaku/danmaku-prefs';

describe('danmaku speed steps', () => {
  it('snaps to five discrete values with 适中=10', () => {
    expect(nearestDanmakuSpeedStep(10).name).toBe('适中');
    expect(nearestDanmakuSpeedStep(10).value).toBe(10);
    expect(nearestDanmakuSpeedStep(15).name).toBe('极慢');
    expect(nearestDanmakuSpeedStep(5).name).toBe('极快');
    expect(nearestDanmakuSpeedStep(9).value).toBe(10);
    expect(nearestDanmakuSpeedStep(6).value).toBe(5);
  });

  it('SPEED option values stay unique for panel matching', () => {
    const values = ARTPLAYER_DANMAKU_SPEED_OPTION.steps.map((s) => s.value);
    expect(new Set(values).size).toBe(5);
    expect(values).toContain(10);
    expect(values).toContain(15);
  });
});
