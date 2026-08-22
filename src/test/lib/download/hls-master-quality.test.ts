import { describe, expect, it } from 'vitest';
import { pickHlsMasterVariant } from '@/lib/download/ytdlp/hls-native';

const MASTER = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
https://cdn.example/360.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=1280x720
https://cdn.example/720.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1920x1080
https://cdn.example/1080.m3u8
`;

describe('pickHlsMasterVariant respects maxHeight', () => {
  it('picks best overall when no maxHeight', () => {
    expect(pickHlsMasterVariant(MASTER, 'https://cdn.example/master.m3u8')).toBe(
      'https://cdn.example/1080.m3u8',
    );
  });

  it('caps at 360 when maxHeight=360', () => {
    expect(
      pickHlsMasterVariant(MASTER, 'https://cdn.example/master.m3u8', { maxHeight: 360 }),
    ).toBe('https://cdn.example/360.m3u8');
  });

  it('caps at 720 when maxHeight=720', () => {
    expect(
      pickHlsMasterVariant(MASTER, 'https://cdn.example/master.m3u8', { maxHeight: 720 }),
    ).toBe('https://cdn.example/720.m3u8');
  });
});
