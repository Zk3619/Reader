import { describe, expect, it } from 'vitest';
import { parseVideoPlaybackExtrasFromRaw } from '@/lib/media/video/artplayer/parse-playback-extras';
import { isLocalSeekThumbSource } from '@/lib/media/video/playback/local-thumb';

describe('parseVideoPlaybackExtrasFromRaw', () => {
  it('reads dedicated thumbnail_vtt without treating it as subtitle', () => {
    const extras = parseVideoPlaybackExtrasFromRaw(
      JSON.stringify({
        subtitle_url: 'https://cdn.example/sub.vtt',
        thumbnail_vtt: 'https://cdn.example/thumbs.vtt',
      }),
    );
    expect(extras?.subtitleUrl).toBe('https://cdn.example/sub.vtt');
    expect(extras?.vttThumbnailUrl).toBe('https://cdn.example/thumbs.vtt');
  });

  it('maps bare vtt with thumb-like name to thumbnail url', () => {
    const extras = parseVideoPlaybackExtrasFromRaw(
      JSON.stringify({ vtt: 'https://cdn.example/preview_sprite.vtt' }),
    );
    expect(extras?.vttThumbnailUrl).toBe('https://cdn.example/preview_sprite.vtt');
    expect(extras?.subtitleUrl).toBeUndefined();
  });

  it('maps bare vtt to subtitle when not thumb-like', () => {
    const extras = parseVideoPlaybackExtrasFromRaw(
      JSON.stringify({ vtt: 'https://cdn.example/episode.vtt' }),
    );
    expect(extras?.subtitleUrl).toBe('https://cdn.example/episode.vtt');
    expect(extras?.vttThumbnailUrl).toBeUndefined();
  });
});

describe('isLocalSeekThumbSource', () => {
  it('accepts filesystem paths and rejects http(s)/asset play urls', () => {
    expect(isLocalSeekThumbSource('D:\\Videos\\a.mkv')).toBe(true);
    expect(isLocalSeekThumbSource('file:///D:/Videos/a.mkv')).toBe(true);
    expect(isLocalSeekThumbSource('https://cdn.example/a.mp4')).toBe(false);
    expect(isLocalSeekThumbSource('http://asset.localhost/D%3A%2FVideos%2Fa.mkv')).toBe(false);
  });
});
