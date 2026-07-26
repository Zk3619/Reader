import { describe, expect, it } from 'vitest';
import {
  buildVideoEpisodeCacheId,
  formatVideoCacheSize,
  isHlsMediaUrl,
  normalizeMediaUrlForCacheKey,
} from '@/lib/media/video/cache/video-disk-cache';
import {
  mergeVideoCacheTier,
  normalizeVideoCacheTier,
} from '@/lib/media/video/cache/video-cache-tier';
import {
  isLocalSeekThumbSource,
  isProxySeekThumbSource,
} from '@/lib/media/video/playback/local-thumb';

describe('video cache helpers', () => {
  it('detects hls urls', () => {
    expect(isHlsMediaUrl('https://cdn.example/a.m3u8')).toBe(true);
    expect(isHlsMediaUrl('https://cdn.example/a.m3u8?token=1')).toBe(true);
    expect(isHlsMediaUrl('https://cdn.example/a.mp4')).toBe(false);
  });

  it('merges tiers with manual priority', () => {
    expect(mergeVideoCacheTier('auto', 'manual')).toBe('manual');
    expect(mergeVideoCacheTier('manual', 'auto')).toBe('manual');
    expect(normalizeVideoCacheTier('manual')).toBe('manual');
    expect(normalizeVideoCacheTier(undefined)).toBe('auto');
  });

  it('formats sizes', () => {
    expect(formatVideoCacheSize(0)).toBe('0 B');
    expect(formatVideoCacheSize(2048)).toMatch(/KB/);
  });

  it('normalizes signed media urls for stable cache keys', () => {
    const a = normalizeMediaUrlForCacheKey(
      'https://cdn.example/path/BBA.mp4?token=aaa&expires=1&foo=keep',
    );
    const b = normalizeMediaUrlForCacheKey(
      'https://cdn.example/path/BBA.mp4?token=bbb&expires=2&foo=keep',
    );
    expect(a).toBe(b);
    expect(a).toContain('/path/bba.mp4');
  });

  it('uses stable episode id when episodeUrl is not a media file', () => {
    const id1 = buildVideoEpisodeCacheId(
      123,
      'https://site.example/ep/1',
      'https://cdn.example/a.mp4?token=1',
    );
    const id2 = buildVideoEpisodeCacheId(
      123,
      'https://site.example/ep/1',
      'https://cdn.example/a.mp4?token=2',
    );
    expect(id1).toBe(id2);
  });
});

describe('local seek thumb source', () => {
  it('rejects generic http play urls', () => {
    expect(isLocalSeekThumbSource('D:\\a.mkv')).toBe(true);
    expect(isLocalSeekThumbSource('http://asset.localhost/x')).toBe(false);
    expect(isLocalSeekThumbSource('https://cdn.example/a.mp4')).toBe(false);
  });

  it('accepts local proxy direct mp4 but not proxy m3u8', () => {
    expect(isProxySeekThumbSource('http://127.0.0.1:9978/proxy?do=http&url=x')).toBe(true);
    expect(isProxySeekThumbSource('http://localhost:9978/proxy?url=a.mp4')).toBe(true);
    expect(isProxySeekThumbSource('http://127.0.0.1:9978/proxy?do=m3u8&url=x')).toBe(false);
    expect(isProxySeekThumbSource('https://cdn.example/a.mp4')).toBe(false);
    expect(isLocalSeekThumbSource('http://127.0.0.1:9978/proxy?do=http&url=x')).toBe(true);
    expect(
      isProxySeekThumbSource('http://127.0.0.1:9978/proxy?do=file&path=D%3A%5Cx%5Cvideo.bin'),
    ).toBe(true);
  });
});
