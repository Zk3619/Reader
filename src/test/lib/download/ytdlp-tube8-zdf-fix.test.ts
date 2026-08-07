import { describe, expect, it, vi } from 'vitest';
import { Tube8IE } from '@/lib/download/ytdlp/extractors/hand-t/tube8';
import { collapseContiguousSameUrlByteRanges } from '@/lib/download/ytdlp/hls-native';

/** Minimal playervars page (trimmed from live tube8 HTML). */
const TUBE8_FIXTURE = `<!doctype html><html><body><h1>18 Virgin Sex - 18 year old Shelby</h1>
<script>
        playervars: {"disable_sharebar":1,"video_duration":418,"video_title":"18 Virgin Sex - 18 year old Shelby","image_url":"https://ei-ph.t8cdn.com/videos/x.jpg","mediaDefinitions":[{"format":"hls","videoUrl":"https://www.tube8.com/media/hls/?s=test"},{"format":"mp4","videoUrl":"https://www.tube8.com/media/mp4/?s=test"}],"video_unavailable":false}
</script></body></html>`;

describe('Tube8IE URL matching', () => {
  it('matches modern porn-video and embed URLs', () => {
    expect(Tube8IE.suitable('https://www.tube8.com/porn-video/31619921/')).toBe(true);
    expect(Tube8IE.suitable('https://www.tube8.com/porn-video/31619921/some-slug/')).toBe(true);
    expect(Tube8IE.suitable('https://www.tube8.com/embed/31619921/')).toBe(true);
  });

  it('still matches legacy category/slug/id URLs', () => {
    expect(Tube8IE.suitable('http://www.tube8.com/teen/kasia-music-video/229795/')).toBe(true);
  });
});

describe('Tube8IE extract from fixture', () => {
  it('parses playervars mediaDefinitions offline', async () => {
    const ie = new Tube8IE();
    vi.spyOn(ie as unknown as { _download_webpage: (...a: unknown[]) => Promise<string> }, '_download_webpage').mockResolvedValue(
      TUBE8_FIXTURE,
    );
    vi.spyOn(ie as unknown as { _download_json: (...a: unknown[]) => Promise<unknown> }, '_download_json').mockImplementation(
      async (...args: unknown[]) => {
        const url = String(args[0] ?? '');
        if (url.includes('/media/mp4/')) {
          return [
            {
              defaultQuality: true,
              format: 'mp4',
              quality: '720',
              videoUrl: 'https://cdn.example/videos/720P_4000K_1.mp4?x=1',
              videoSize: 12345678,
            },
          ];
        }
        if (String(url).includes('/media/hls/')) {
          return [
            {
              defaultQuality: true,
              format: 'hls',
              quality: '720',
              videoUrl: 'https://cdn.example/hls/master.m3u8',
            },
          ];
        }
        return [];
      },
    );
    vi.spyOn(
      ie as unknown as { _extract_m3u8_formats: (...a: unknown[]) => Promise<unknown[]> },
      '_extract_m3u8_formats',
    ).mockResolvedValue([
      {
        format_id: 'hls-720',
        url: 'https://cdn.example/hls/index.m3u8',
        protocol: 'm3u8_native',
        height: 720,
      },
    ]);

    const info = await ie._real_extract('https://www.tube8.com/porn-video/31619921/');
    expect(info.id).toBe('31619921');
    expect(String(info.title)).toMatch(/Shelby|Virgin|Sex/i);
    expect((info.formats || []).length).toBeGreaterThan(0);
    expect(
      (info.formats || []).some(
        (f) => /mp4|m3u8/i.test(f.url || '') || String(f.protocol || '').includes('m3u8'),
      ),
    ).toBe(true);
    // videoSize often missing — must still expose approximate size for UI totals
    const withSize = (info.formats || []).filter(
      (f) => Number(f.filesize || f.filesize_approx || 0) > 1_000_000,
    );
    expect(withSize.length).toBeGreaterThan(0);
  });
});

describe('HLS CMAF collapse (ZDF-style)', () => {
  it('collapses contiguous same-URL byteranges', () => {
    const url = 'https://cdn.example/video.mp4';
    const frags = [
      { url, byteRange: { start: 0, end: 1000 } },
      { url, byteRange: { start: 1000, end: 2500 } },
      { url, byteRange: { start: 2500, end: 4000 } },
    ];
    expect(collapseContiguousSameUrlByteRanges(frags)).toEqual({
      url,
      byteRange: { start: 0, end: 4000 },
    });
  });

  it('rejects gaps (would otherwise spawn .ytdl frag flood)', () => {
    const url = 'https://cdn.example/video.mp4';
    expect(
      collapseContiguousSameUrlByteRanges([
        { url, byteRange: { start: 0, end: 1000 } },
        { url, byteRange: { start: 1200, end: 2000 } },
      ]),
    ).toBeNull();
  });
});
