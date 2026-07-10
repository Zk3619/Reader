import { describe, expect, it } from 'vitest';
import {
  playableFromTrack,
  playableFromChapter,
  getPlayableUrls,
} from '@/lib/media/audio/playable-item';
import type { AudioTrack } from '@/lib/media/audio/track-types';

describe('playable-item', () => {
  it('maps track to playable item', () => {
    const track: AudioTrack = {
      id: 'kw:1',
      name: 'Song',
      artist: 'Artist',
      source: 'kw',
      duration: '03:00',
      meta: { lyricText: '[00:00.00]hello' },
    };
    const item = playableFromTrack(track, ['http://example.com/a.mp3']);
    expect(item.kind).toBe('track');
    expect(item.title).toBe('Song');
    expect(getPlayableUrls(item)).toEqual(['http://example.com/a.mp3']);
  });

  it('maps chapter to playable item', () => {
    const item = playableFromChapter(
      {
        url: 'chapter://1',
        title: '第一章',
        index: 0,
        bookUrl: 'book://1',
        isVolume: false,
        baseUrl: 'book://1',
        isVip: false,
        isPay: false,
      },
      ['blob:abc'],
    );
    expect(item.kind).toBe('chapter');
    expect(getPlayableUrls(item)).toEqual(['blob:abc']);
  });
});
