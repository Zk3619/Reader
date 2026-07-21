import { describe, expect, it } from 'vitest';
import {
  createMinimalFlacForTests,
  embedDownloadAudioTags,
  readFlacVorbisTitleForTests,
} from '@/lib/media/audio/music-download-tags';
import { mergeMusicCacheTier } from '@/lib/media/audio/music-cache-tier';

describe('mergeMusicCacheTier', () => {
  it('manual wins over auto', () => {
    expect(mergeMusicCacheTier('manual', 'auto')).toBe('manual');
    expect(mergeMusicCacheTier('auto', 'manual')).toBe('manual');
    expect(mergeMusicCacheTier(undefined, 'auto')).toBe('auto');
  });
});

describe('embedDownloadAudioTags', () => {
  it('prepends ID3 for mp3', () => {
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
  });

  it('embeds vorbis comment into minimal flac without corrupting fLaC header', () => {
    const body = createMinimalFlacForTests();
    expect(String.fromCharCode(body[0]!, body[1]!, body[2]!, body[3]!)).toBe('fLaC');

    const tagged = embedDownloadAudioTags(body, 'flac', {
      title: '歌名',
      artist: '歌手',
      album: '专辑',
      lyric: '[00:01.00]hello',
      embedLyric: true,
      embedCover: false,
    });
    expect(String.fromCharCode(tagged[0]!, tagged[1]!, tagged[2]!, tagged[3]!)).toBe('fLaC');
    expect(tagged.byteLength).toBeGreaterThan(body.byteLength);
    // STREAMINFO 仍为第一个元数据块
    expect(tagged[4]! & 0x7f).toBe(0);
    expect(readFlacVorbisTitleForTests(tagged)).toBe('歌名');
  });

  it('leaves unknown formats unchanged', () => {
    const body = new Uint8Array([1, 2, 3, 4]);
    expect(
      embedDownloadAudioTags(body, 'm4a', { title: 'x', artist: 'y' }),
    ).toEqual(body);
  });
});
