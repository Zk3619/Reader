/**
 * yt-dlp registry smoke harness — 验证全站 registry 可加载且内置 IE 可用
 */
import { describe, expect, it } from 'vitest';
import '@/lib/download/ytdlp/extractors';
import {
  ensureBuiltinLoaded,
  getExtractorForUrl,
  listExtractors,
} from '@/lib/download/ytdlp/registry';
import { selectFormats } from '@/lib/download/ytdlp/format-selector';
import type { Format } from '@/lib/download/ytdlp/types';

describe('ytdlp registry', () => {
  it('loads generated registry with full site coverage', () => {
    ensureBuiltinLoaded();
    const all = listExtractors();
    expect(all.length).toBeGreaterThan(900);
  });

  it('matches youtube and bilibili with builtin extractors', () => {
    ensureBuiltinLoaded();
    const yt = getExtractorForUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(yt).toBeTruthy();
    expect(String(yt!.IE_NAME || yt!.constructor.name)).toMatch(/youtube/i);
    const bili = getExtractorForUrl('https://www.bilibili.com/video/BV1xx411c7mD');
    expect(bili).toBeTruthy();
    expect(String(bili!.IE_NAME || bili!.constructor.name)).toMatch(/bili/i);
  });
});

describe('format-selector', () => {
  it('selects best video+audio with bv*+ba/b when separate tracks exist', () => {
    const formats: Format[] = [
      { format_id: '137', ext: 'mp4', height: 1080, vcodec: 'avc1', acodec: 'none', url: 'v' },
      { format_id: '140', ext: 'm4a', abr: 128, vcodec: 'none', acodec: 'mp4a', url: 'a' },
      { format_id: '18', ext: 'mp4', height: 360, vcodec: 'avc1', acodec: 'mp4a', url: 'm' },
    ];
    const selected = selectFormats(formats, 'bv*+ba/b');
    expect(selected).toHaveLength(1);
    expect(selected[0]!.requested_formats?.map((f) => f.format_id)).toEqual(['137', '140']);
  });

  it('falls back to single best when only muxed HLS formats exist (AcFun-like)', () => {
    const formats: Format[] = [
      {
        format_id: 'hls-0',
        ext: 'mp4',
        height: 1080,
        vcodec: 'avc1.640032',
        acodec: 'mp4a.40.2',
        tbr: 3000,
        url: 'https://cdn.example/1080.m3u8',
        protocol: 'm3u8_native',
      },
      {
        format_id: 'hls-1',
        ext: 'mp4',
        height: 720,
        vcodec: 'avc1.64001F',
        acodec: 'mp4a.40.2',
        tbr: 1500,
        url: 'https://cdn.example/720.m3u8',
        protocol: 'm3u8_native',
      },
    ];
    const selected = selectFormats(formats, 'bv*+ba/b');
    expect(selected).toHaveLength(1);
    expect(selected[0]!.requested_formats).toBeUndefined();
    expect(selected[0]!.format_id).toBe('hls-0');
    expect(selected[0]!.url).toContain('1080');
  });

  it('bestvideo without * rejects muxed-only pools', () => {
    const formats: Format[] = [
      { format_id: '18', ext: 'mp4', height: 360, vcodec: 'avc1', acodec: 'mp4a', url: 'm' },
    ];
    expect(selectFormats(formats, 'bestvideo')).toHaveLength(0);
    expect(selectFormats(formats, 'bestaudio')).toHaveLength(0);
    expect(selectFormats(formats, 'bestvideo*')[0]?.format_id).toBe('18');
    expect(selectFormats(formats, 'bestaudio*')[0]?.format_id).toBe('18');
  });
});
