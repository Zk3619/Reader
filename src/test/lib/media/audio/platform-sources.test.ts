import { describe, expect, it } from 'vitest';
import { computeMixinKeyFromUrls } from '@/lib/media/audio/platform/api/bili/wbi';
import {
  buildSidAuthorization,
  resolveSapisidAuthorization,
} from '@/lib/media/audio/platform/api/ytm/auth-headers';
import {
  PLATFORM_SOURCES,
  isPlatformSource,
} from '@/lib/media/audio/platform/platform-sources';
import {
  BUILTIN_SOURCES,
  listSearchSources,
  searchSourceLabel,
} from '@/lib/media/audio/online/source-router';
import { parseSignatureCipher } from '@/lib/media/audio/platform/api/ytm/sig-solver';
import { selectBiliAudioStream, parseBiliDashAudio } from '@/lib/media/audio/platform/api/bili/audio-select';

describe('platform sources registry', () => {
  it('lists netease/bili/ytm after builtin five', () => {
    expect(PLATFORM_SOURCES).toEqual(['netease', 'bili', 'ytm']);
    const listed = listSearchSources();
    const bi = listed.indexOf('mg');
    const ni = listed.indexOf('netease');
    expect(bi).toBeGreaterThanOrEqual(0);
    expect(ni).toBeGreaterThan(bi);
    expect(listed).toContain('bili');
    expect(listed).toContain('ytm');
    for (const s of BUILTIN_SOURCES) {
      expect(listed).toContain(s);
    }
  });

  it('labels distinguish wy vs netease', () => {
    expect(searchSourceLabel('wy')).toBe('网易');
    expect(searchSourceLabel('netease')).toBe('网易云音乐');
    expect(isPlatformSource('netease')).toBe(true);
    expect(isPlatformSource('wy')).toBe(false);
  });
});

describe('bili wbi mixin', () => {
  it('computes mixin key from img/sub urls', () => {
    // 公开算法：img_key + sub_key 按 MIXIN_INDEX 重排取前 32
    const key = computeMixinKeyFromUrls(
      'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png',
      'https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01be6cb9f8999.png',
    );
    expect(key).toHaveLength(32);
    expect(key).toMatch(/^[a-f0-9]+$/i);
  });

  it('selects dash audio by quality preference', () => {
    const streams = parseBiliDashAudio([
      { id: 30216, baseUrl: 'https://a/low', bandwidth: 64_000, mimeType: 'audio/mp4' },
      { id: 30280, baseUrl: 'https://a/high', bandwidth: 192_000, mimeType: 'audio/mp4' },
      { id: 30251, baseUrl: 'https://a/flac', bandwidth: 1_000_000, mimeType: 'audio/flac' },
    ]);
    const hi = selectBiliAudioStream(streams, 'flac');
    expect(hi?.url).toContain('flac');
    const mid = selectBiliAudioStream(streams, '128k');
    expect(mid?.url).toBeTruthy();
  });
});

describe('ytm auth headers', () => {
  it('builds SAPISIDHASH', () => {
    const auth = buildSidAuthorization(
      'SAPISIDHASH',
      'test-sid',
      'https://music.youtube.com',
      1_700_000_000,
    );
    expect(auth.startsWith('SAPISIDHASH 1700000000_')).toBe(true);
    expect(auth.split('_')[1]).toHaveLength(40);
  });

  it('resolves multi scheme from cookie', () => {
    const header = resolveSapisidAuthorization(
      'SAPISID=aaa; __Secure-1PAPISID=bbb; __Secure-3PAPISID=ccc',
    );
    expect(header).toContain('SAPISIDHASH');
    expect(header).toContain('SAPISID1PHASH');
    expect(header).toContain('SAPISID3PHASH');
  });

  it('parses signatureCipher', () => {
    const parsed = parseSignatureCipher(
      's=ABC%3D%3D&sp=sig&url=https%3A%2F%2Fgooglevideo.com%2Fvideoplayback%3Fid%3D1',
    );
    expect(parsed.s).toBe('ABC==');
    expect(parsed.sp).toBe('sig');
    expect(parsed.url).toContain('googlevideo.com');
  });
});
