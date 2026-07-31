import { describe, expect, it } from 'vitest';
import { computeLyricScrollTop, LYRIC_SCROLL_ANCHOR } from '@/lib/media/audio/lyric-scroll';

describe('computeLyricScrollTop', () => {
  it('anchors active line midpoint at vertical center of viewport (LX)', () => {
    // 行顶 500、行高 40 → 行心 520；视口 400 → 锚点 200；scrollTop = 320
    expect(computeLyricScrollTop(500, 400, 40)).toBe(500 + 20 - 400 * LYRIC_SCROLL_ANCHOR);
    expect(LYRIC_SCROLL_ANCHOR).toBe(0.5);
  });

  it('falls back to top-edge when line height is 0', () => {
    expect(computeLyricScrollTop(500, 400)).toBe(500 - 400 * LYRIC_SCROLL_ANCHOR);
  });

  it('clamps to zero near the top', () => {
    expect(computeLyricScrollTop(20, 400, 40)).toBe(0);
  });

  it('returns 0 when container has no height (hidden / unlaid-out)', () => {
    expect(computeLyricScrollTop(500, 0, 40)).toBe(0);
  });

  it('respects custom anchor', () => {
    expect(computeLyricScrollTop(500, 400, 40, 0.2)).toBe(500 + 20 - 400 * 0.2);
  });
});
