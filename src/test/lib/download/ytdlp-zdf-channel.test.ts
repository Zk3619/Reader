import { describe, expect, it } from 'vitest';
import { ZDFChannelIE } from '@/lib/download/ytdlp/extractors/hand-z/zdf';

describe('ZDFChannelIE', () => {
  it('matches channel URLs but not single video URLs', () => {
    expect(
      ZDFChannelIE.suitable('https://www.zdf.de/magazine/heute-journal-104'),
    ).toBe(true);
    expect(
      ZDFChannelIE.suitable(
        'https://www.zdf.de/video/dokus/ein-tag-im-juli---ahrtalflut-2021-movie-100/terra-x-history-ein-tag-im-juli-ahrtalflut-2021-100',
      ),
    ).toBe(false);
  });

  it('playlist_items slices channel entry list', async () => {
    const { resolvePlaylistIndices } = await import('@/lib/download/ytdlp/playlist-items');
    expect(resolvePlaylistIndices(10, { playlist_items: '1:3' })).toEqual([0, 1, 2]);
  });
});

const LIVE = process.env.CI !== 'true' && process.env.YTDLP_LIVE_SMOKE === '1';

describe.skipIf(!LIVE)('ZDFChannel live smoke', () => {
  it('extracts heute-journal channel as playlist', async () => {
    const { YoutubeDL } = await import('@/lib/download/ytdlp/youtube-dl');
    const ydl = new YoutubeDL({
      quiet: true,
      no_warnings: true,
      playlist_items: '1:2',
      extract_flat: true,
    });
    try {
      const info = await ydl.extract_info(
        'https://www.zdf.de/magazine/heute-journal-104',
        false,
        'ZDFChannel',
      );
      expect(info?._type).toBe('playlist');
      expect((info?.entries || []).length).toBeGreaterThan(0);
    } catch (e) {
      const msg = (e as Error).message;
      if (/fetch failed|timeout|Connect Timeout/i.test(msg)) {
        console.warn(`[zdf live] network unavailable: ${msg}`);
        return;
      }
      throw e;
    }
  }, 180_000);
});
