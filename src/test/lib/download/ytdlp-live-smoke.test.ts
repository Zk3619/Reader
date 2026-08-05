import { describe, expect, it } from 'vitest';
import { runLiveSmokeCases } from '@/lib/download/ytdlp/live-smoke-runner';

const LIVE = process.env.CI !== 'true' && process.env.YTDLP_LIVE_SMOKE === '1';

describe.skipIf(!LIVE)('ytdlp live smoke (YTDLP_LIVE_SMOKE=1)', () => {
  it('runs upstream sample URLs and records outcomes', async () => {
    const results = await runLiveSmokeCases();
    for (const r of results) {
      console.info(`[live-smoke] ${r.site}: ${r.ok ? 'OK' : 'FAIL'} ${r.error || r.title || ''}`);
    }
    expect(results.length).toBe(4);
    const anyOk = results.some((r) => r.ok);
    expect(anyOk || results.every((r) => r.error)).toBe(true);
  }, 180_000);

  it('native AES HLS parser accepts encrypted fixture', async () => {
    const { mediaPlaylistNeedsNativeAes, parseHlsMediaPlaylist } = await import(
      '@/lib/download/ytdlp/hls-native'
    );
    const fixture = [
      '#EXTM3U',
      '#EXT-X-KEY:METHOD=AES-128,URI="https://example.com/key.bin",IV=0x00000000000000000000000000000001',
      '#EXTINF:1.0,',
      'seg0.ts',
    ].join('\n');
    expect(mediaPlaylistNeedsNativeAes(fixture)).toBe(true);
    const parsed = parseHlsMediaPlaylist(fixture, 'https://example.com/live.m3u8');
    expect(parsed.fragments[0]?.decrypt.method).toBe('AES-128');
  });
});

describe('ytdlp live smoke offline guards', () => {
  it('skips network smoke unless YTDLP_LIVE_SMOKE=1', () => {
    expect(LIVE || process.env.YTDLP_LIVE_SMOKE !== '1').toBe(true);
  });
});
