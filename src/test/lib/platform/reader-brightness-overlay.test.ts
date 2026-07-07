import { describe, expect, it } from 'vitest';
import {
  mapReadBrightnessToOverlayLuminance,
  READER_BRIGHTNESS_OVERLAY_LUMINANCE_FLOOR,
} from '@/lib/platform/reader-brightness-overlay';

describe('mapReadBrightnessToOverlayLuminance', () => {
  it('100% 为原样亮度（不过曝）', () => {
    expect(mapReadBrightnessToOverlayLuminance(100)).toBe(1);
  });

  it('0% 保留最低背光而非全黑', () => {
    expect(mapReadBrightnessToOverlayLuminance(0)).toBe(
      READER_BRIGHTNESS_OVERLAY_LUMINANCE_FLOOR,
    );
  });

  it('50% 处于上下限之间且偏暗', () => {
    const mid = mapReadBrightnessToOverlayLuminance(50);
    expect(mid).toBeGreaterThan(READER_BRIGHTNESS_OVERLAY_LUMINANCE_FLOOR);
    expect(mid).toBeLessThan(0.65);
  });

  it('随滑条单调递增', () => {
    const samples = [0, 25, 50, 75, 100].map(mapReadBrightnessToOverlayLuminance);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThan(samples[i - 1]!);
    }
  });
});
