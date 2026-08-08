import { describe, expect, it } from 'vitest';
import {
  resolveYtdlpMediaParts,
  stripDownloadPartSuffix,
} from '@/lib/download/gopeed/engine-bridge';

describe('resolveYtdlpMediaParts', () => {
  it('uses meta.requestedFormats when present', () => {
    const parts = resolveYtdlpMediaParts({
      requestedFormats: [
        { url: 'https://a/v.mp4', format_id: 'v', role: 'video', ext: 'mp4' },
        { url: 'https://a/a.m4a', format_id: 'a', role: 'audio', ext: 'm4a' },
      ],
    });
    expect(parts).toHaveLength(2);
    expect(parts[0]!.url).toContain('/v.mp4');
    expect(parts[1]!.role).toBe('audio');
  });

  it('falls back to progressive format with url', () => {
    const parts = resolveYtdlpMediaParts({
      formats: [
        {
          format_id: '1',
          url: 'https://cdn/x.mp4',
          vcodec: 'avc1',
          acodec: 'mp4a',
          ext: 'mp4',
        },
      ],
    });
    expect(parts).toHaveLength(1);
    expect(parts[0]!.url).toBe('https://cdn/x.mp4');
  });
});

describe('stripDownloadPartSuffix', () => {
  it('strips trailing .part only', () => {
    expect(stripDownloadPartSuffix('D:\\dl\\a.mp4.part')).toBe('D:\\dl\\a.mp4');
    expect(stripDownloadPartSuffix('/tmp/a.mp4')).toBe('/tmp/a.mp4');
    expect(stripDownloadPartSuffix('movie.part-video-0.mp4')).toBe('movie.part-video-0.mp4');
  });
});
