import { describe, expect, it } from 'vitest';
import { pickLyricText } from '@/lib/media/audio/lyric-types';
import {
  getPlayQuality,
  listPlayQualityPreferenceOptions,
  qualityFallbackChain,
  resolvePlayQualityPreference,
} from '@/lib/media/audio/music-quality';

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

  it('resolves dynamic highest and lowest quality preferences', () => {
    const available = ['128k', '320k', 'flac'] as const;
    expect(resolvePlayQualityPreference('highest', available)).toBe('flac');
    expect(resolvePlayQualityPreference('lowest', available)).toBe('128k');
  });

  it('always exposes highest and lowest quality preference options', () => {
    expect(listPlayQualityPreferenceOptions()).toEqual(
      expect.arrayContaining(['lowest', 'highest']),
    );
  });
});
