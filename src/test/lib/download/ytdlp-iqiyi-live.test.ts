/**
 * Live iqiyi extract smoke (network). Skips when READER_LIVE_SMOKE is unset.
 */
import { describe, expect, it } from 'vitest';
import { YoutubeDL } from '@/lib/download/ytdlp/youtube-dl';

const live = !!process.env.READER_LIVE_SMOKE;

describe.skipIf(!live)('IqiyiIE live extract', () => {
  it(
    'desktop play page yields dash formats',
    async () => {
      const ydl = new YoutubeDL({ quiet: true, skip_download: true });
      const info = await ydl.extract_info(
        'https://www.iqiyi.com/v_1j5itvyt0co.html?a=image&qyTrace=88MqbauD6T1JhhjX',
        false,
      );
      expect(info?.extractor).toBe('iqiyi');
      expect(info?.formats?.length).toBeGreaterThan(0);
      expect(info?.formats?.every((f) => f.protocol !== 'https' || (f.fragments?.length ?? 0) > 0 || /\.m3u8/i.test(f.url || ''))).toBe(
        true,
      );
      // Must not be a bare webpage URL
      expect(info?.formats?.[0]?.url).not.toMatch(/iqiyi\.com\/v_/);
      expect(info?.title).toBeTruthy();
    },
    120_000,
  );

  it(
    'qy.net short link resolves to playable formats (not webpage)',
    async () => {
      const ydl = new YoutubeDL({ quiet: true, skip_download: true });
      const info = await ydl.extract_info('https://qy.net/18JJNdT-09?vfrm=pcw_album_auto', false);
      expect(info?.extractor).toBe('iqiyi');
      expect(info?.formats?.length).toBeGreaterThan(0);
      const first = info!.formats![0]!;
      expect(first.url).not.toMatch(/qy\.net/i);
      expect(first.url).not.toMatch(/sharePlay\.html/i);
      expect((first.fragments?.length ?? 0) > 0 || /\.m3u8/i.test(first.url || '')).toBe(true);
    },
    120_000,
  );
});
