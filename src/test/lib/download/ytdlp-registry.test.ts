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
  it('selects best video+audio with bv*+ba/b', () => {
    const formats: Format[] = [
      { format_id: '137', ext: 'mp4', height: 1080, vcodec: 'avc1', acodec: 'none', url: 'v' },
      { format_id: '140', ext: 'm4a', abr: 128, vcodec: 'none', acodec: 'mp4a', url: 'a' },
      { format_id: '18', ext: 'mp4', height: 360, vcodec: 'avc1', acodec: 'mp4a', url: 'm' },
    ];
    const selected = selectFormats(formats, 'bv*+ba/b');
    expect(selected.length).toBeGreaterThan(0);
  });
});
