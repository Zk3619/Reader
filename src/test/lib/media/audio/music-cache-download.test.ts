import { describe, expect, it } from 'vitest';
import { embedDownloadAudioTags } from '@/lib/media/audio/music-download-tags';
import { mergeMusicCacheTier } from '@/lib/media/audio/music-cache-tier';

describe('mergeMusicCacheTier', () => {
  it('manual wins over auto', () => {
    expect(mergeMusicCacheTier('manual', 'auto')).toBe('manual');
    expect(mergeMusicCacheTier('auto', 'manual')).toBe('manual');
    expect(mergeMusicCacheTier(undefined, 'auto')).toBe('auto');
  });
});

describe('embedDownloadAudioTags', () => {
  it('prepends ID3 for mp3 and leaves flac unchanged', () => {
    const body = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4]);
    const tagged = embedDownloadAudioTags(body, 'mp3', {
      title: '歌名',
      artist: '歌手',
      album: '专辑',
      embedLyric: false,
      embedCover: false,
    });
    expect(tagged[0]).toBe(0x49); // I
    expect(tagged[1]).toBe(0x44); // D
    expect(tagged[2]).toBe(0x33); // 3
    expect(tagged.byteLength).toBeGreaterThan(body.byteLength);

    const flac = embedDownloadAudioTags(body, 'flac', {
      title: '歌名',
      artist: '歌手',
    });
    expect(flac).toEqual(body);
  });
});
