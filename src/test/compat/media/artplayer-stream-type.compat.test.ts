import { describe, expect, it } from 'vitest';
import { detectArtplayerStreamType } from '@/lib/media/video/artplayer/detect-stream-type';

describe('detectArtplayerStreamType', () => {
  it('识别 m3u8 / flv / mpd', () => {
    expect(detectArtplayerStreamType('https://cdn.example/a.m3u8')).toBe('m3u8');
    expect(detectArtplayerStreamType('https://cdn.example/live.flv')).toBe('flv');
    expect(detectArtplayerStreamType('https://cdn.example/manifest.mpd')).toBe('mpd');
  });

  it('代理 URL 中 target 含 m3u8', () => {
    const proxied =
      '/__reader_http?target=' +
      encodeURIComponent('https://vod.example/seg/index.m3u8') +
      '&session=abc';
    expect(detectArtplayerStreamType(proxied)).toBe('m3u8');
  });

  it('识别 type=m3u8 与代理嵌套', () => {
    expect(detectArtplayerStreamType('https://cdn.example/play?type=m3u8')).toBe('m3u8');
    const proxied =
      'http://127.0.0.1:9978/proxy?do=http&url=' +
      encodeURIComponent('https://vod.example/seg/index.m3u8');
    expect(detectArtplayerStreamType(proxied)).toBe('m3u8');
  });

  it('mp4 返回 undefined 走原生', () => {
    expect(detectArtplayerStreamType('https://cdn.example/a.mp4')).toBeUndefined();
  });
});
