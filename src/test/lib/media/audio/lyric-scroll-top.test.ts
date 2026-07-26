import { describe, expect, it } from 'vitest';
import { computeLyricScrollTop, LYRIC_SCROLL_ANCHOR } from '@/lib/media/audio/lyric-scroll';

describe('computeLyricScrollTop', () => {
  it('anchors active line at vertical center of viewport', () => {
    expect(computeLyricScrollTop(500, 400)).toBe(500 - 400 * LYRIC_SCROLL_ANCHOR);
    expect(LYRIC_SCROLL_ANCHOR).toBe(0.5);
  });

  it('clamps to zero near the top', () => {
    expect(computeLyricScrollTop(20, 400)).toBe(0);
  });

  it('returns 0 when container has no height (hidden / unlaid-out)', () => {
    expect(computeLyricScrollTop(500, 0)).toBe(0);
  });
});
