import { describe, expect, it } from 'vitest';
import {
  normalizeProxyUrl,
  validateProxyUrl,
  resolveYtdlpProxy,
} from '@/lib/download/ytdlp/networking/socks';
import { parseWebVtt, srtToVtt, formatVttTimestamp } from '@/lib/download/ytdlp/webvtt';
import { YtdlpCache } from '@/lib/download/ytdlp/cache';
import {
  segmentsToChapters,
  skipRangesFromSegments,
  SPONSORBLOCK_CATEGORIES,
} from '@/lib/download/ytdlp/postprocessors/sponsorblock';
import { parseExternalDownloader } from '@/lib/download/ytdlp/external-downloader';
import { detectSpecialProtocol } from '@/lib/download/ytdlp/special-protocols';
import { ja3BuildStatus } from '@/lib/download/ytdlp/networking/ja3-sites';

describe('socks proxy normalize', () => {
  it('parses socks5h://', () => {
    const n = normalizeProxyUrl('socks5h://127.0.0.1:1080');
    expect(n?.kind).toBe('socks5h');
    expect(n?.remoteDns).toBe(true);
    expect(resolveYtdlpProxy('127.0.0.1:1080')).toMatch(/^socks5h:\/\//);
  });

  it('rejects garbage', () => {
    expect(validateProxyUrl('://bad')).toMatch(/Invalid|Unsupported/);
  });
});

describe('webvtt', () => {
  it('parses cues', () => {
    const cues = parseWebVtt(`WEBVTT

00:00:01.000 --> 00:00:02.000
Hello

00:00:03.000 --> 00:00:04.500
World`);
    expect(cues.length).toBe(2);
    expect(cues[0]?.text).toBe('Hello');
    expect(formatVttTimestamp(90)).toBe('00:01:30.000');
  });

  it('srtToVtt converts commas', () => {
    const vtt = srtToVtt(`1
00:00:01,000 --> 00:00:02,000
Hi`);
    expect(vtt).toMatch(/WEBVTT/);
    expect(vtt).toMatch(/00:00:01\.000/);
  });
});

describe('cache', () => {
  it('set/get/expire', () => {
    const c = new YtdlpCache('test-scope');
    c.set('k', 'v', 60);
    expect(c.get('k')).toBe('v');
    c.remove('k');
    expect(c.get('k')).toBeNull();
  });
});

describe('sponsorblock helpers', () => {
  it('segmentsToChapters + skip ranges', () => {
    const segs = [
      { category: 'sponsor', segment: [10, 20] as [number, number] },
      { category: 'poi_highlight', segment: [30, 30] as [number, number] },
    ];
    const chapters = segmentsToChapters(segs, 100);
    expect(chapters[0]?.title).toBe(SPONSORBLOCK_CATEGORIES.sponsor);
    const ranges = skipRangesFromSegments(segs, ['sponsor']);
    expect(ranges).toEqual([[10, 20]]);
  });
});

describe('external + special protocol', () => {
  it('parseExternalDownloader', () => {
    expect(parseExternalDownloader(true)).toBe('aria2c');
    expect(parseExternalDownloader('curl')).toBe('curl');
  });

  it('detectSpecialProtocol', () => {
    expect(detectSpecialProtocol('mhtml')).toBe('mhtml');
    expect(detectSpecialProtocol(undefined, 'https://x.b-cdn.net/a.mp4')).toBe('bunnycdn');
    expect(detectSpecialProtocol('youtube_live_chat')).toBe('youtube_live_chat');
  });
});

describe('ja3 status', () => {
  it('returns profile fields', () => {
    const st = ja3BuildStatus();
    expect(st).toHaveProperty('enabled');
    expect(st).toHaveProperty('profile');
  });
});
