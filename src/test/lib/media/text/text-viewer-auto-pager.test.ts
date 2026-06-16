import { describe, expect, it } from 'vitest';
import {
  TEXT_VIEWER_AUTO_READ_SPEED_DEFAULT,
  computeAutoPagePixelDelta,
  normalizeAutoReadSpeed,
  resolveAutoReadSpeed,
} from '@/lib/media/text/text-viewer-auto-pager';

describe('text-viewer-auto-pager', () => {
  it('normalizeAutoReadSpeed clamps to 1–120 and defaults to 10', () => {
    expect(normalizeAutoReadSpeed(undefined)).toBe(TEXT_VIEWER_AUTO_READ_SPEED_DEFAULT);
    expect(normalizeAutoReadSpeed(0)).toBe(1);
    expect(normalizeAutoReadSpeed(200)).toBe(120);
    expect(normalizeAutoReadSpeed(15.6)).toBe(16);
  });

  it('computeAutoPagePixelDelta matches Legado height/readTime*elapsed', () => {
    const delta = computeAutoPagePixelDelta(800, 10, 100);
    expect(delta).toBeCloseTo(8, 5);
  });

  it('resolveAutoReadSpeed reads configured value', () => {
    expect(resolveAutoReadSpeed(20)).toBe(20);
    expect(resolveAutoReadSpeed(null)).toBe(TEXT_VIEWER_AUTO_READ_SPEED_DEFAULT);
  });
});
