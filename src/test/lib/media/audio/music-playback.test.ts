import { describe, expect, it } from 'vitest';
import { pickLyricText } from '@/lib/media/audio/lyric-types';
import { getPlayQuality, qualityFallbackChain } from '@/lib/media/audio/music-quality';

describe('playback chain helpers', () => {
  it('pickLyricText falls back to lyric', () => {
    expect(pickLyricText({ lyric: 'hello' }, 'tlyric')).toBe('hello');
  });

  it('quality chain includes flac after 320k preference index', () => {
    const chain = qualityFallbackChain('flac');
    expect(chain[0]).toBe('flac');
    expect(chain).toContain('320k');
  });

  it('getPlayQuality returns a known label key', () => {
    const q = getPlayQuality();
    expect(['128k', '192k', '320k', 'flac', 'flac24bit', 'ape', 'wav']).toContain(q);
  });
});
