import { describe, expect, it } from 'vitest';
import { selectBestFormat, matchesFilters, parseFormatSelector } from '@/lib/download/ytdlp/format-selector';
import {
  listAvailableQualityOptions,
  pickFormatsForQuality,
  shouldPromptQualityPick,
  isImageFormat,
  defaultQualityPreset,
  kindForQuality,
} from '@/lib/download/download-quality';
import type { Format } from '@/lib/download/ytdlp/types';

function fmt(partial: Partial<Format> & { format_id: string }): Format {
  return {
    url: `https://example.test/${partial.format_id}`,
    ext: 'mp4',
    vcodec: partial.vcodec ?? (partial.height != null || partial.width != null ? 'avc1' : 'none'),
    acodec: partial.acodec ?? (partial.height != null || partial.width != null ? 'none' : 'mp4a'),
    ...partial,
  } as Format;
}

describe('format height filter (yt-dlp parity)', () => {
  it('rejects formats with missing height for height<=360', () => {
    const single = parseFormatSelector('bestvideo*[height<=360]');
    expect(matchesFilters(fmt({ format_id: 'noh', vcodec: 'avc1', acodec: 'none' }), single.filters)).toBe(
      false,
    );
    expect(
      matchesFilters(fmt({ format_id: '360', height: 360, vcodec: 'avc1', acodec: 'none' }), single.filters),
    ).toBe(true);
    expect(
      matchesFilters(fmt({ format_id: '720', height: 720, vcodec: 'avc1', acodec: 'none' }), single.filters),
    ).toBe(false);
  });

  it('selecting 360p must not return 720p when both exist', () => {
    const formats: Format[] = [
      fmt({ format_id: '720', height: 720, vcodec: 'avc1', acodec: 'none', tbr: 2000 }),
      fmt({ format_id: '360', height: 360, vcodec: 'avc1', acodec: 'none', tbr: 800 }),
      fmt({ format_id: 'a', vcodec: 'none', acodec: 'mp4a', abr: 128 }),
      // 无 height 的高码率轨：旧逻辑会误匹配 height<=360
      fmt({ format_id: 'mystery', vcodec: 'avc1', acodec: 'none', tbr: 5000 }),
    ];

    const picked = selectBestFormat(formats, 'bv*[height<=360]+ba/b[height<=360]');
    expect(picked).toBeTruthy();
    const ids = [
      picked!.format_id,
      ...(picked!.requested_formats ?? []).map((f) => f.format_id),
    ].join(' ');
    expect(ids).toContain('360');
    expect(ids).not.toContain('720');
    expect(ids).not.toContain('mystery');
  });

  it('pickFormatsForQuality(360) never yields video taller than 360', () => {
    const formats: Format[] = [
      fmt({ format_id: '720', height: 720, vcodec: 'avc1', acodec: 'none', tbr: 2000 }),
      fmt({ format_id: '360', height: 360, vcodec: 'avc1', acodec: 'none', tbr: 800 }),
      fmt({ format_id: 'a', vcodec: 'none', acodec: 'mp4a', abr: 128 }),
    ];
    const result = pickFormatsForQuality(formats, '360');
    expect(result).toBeTruthy();
    for (const f of result!.requestedFormats) {
      if (f.vcodec && f.vcodec !== 'none' && Number(f.height) > 0) {
        expect(Number(f.height)).toBeLessThanOrEqual(360);
      }
    }
  });

  it('竖屏 720x1280 按短边视为 720p，仅一档时不弹窗', () => {
    const formats: Format[] = [
      fmt({
        format_id: 'xhs',
        width: 720,
        height: 1280,
        vcodec: 'h264',
        acodec: 'aac',
        tbr: 1500,
        url: 'https://sns-video-qc.xhscdn.com/stream/79/110/258/demo_258.mp4',
      }),
    ];
    const ids = listAvailableQualityOptions(formats).map((o) => o.id);
    expect(ids).toContain('best');
    expect(ids).not.toContain('720');
    expect(ids).not.toContain('360');
    expect(shouldPromptQualityPick(formats)).toBe(false);

    const picked720 = pickFormatsForQuality(formats, '720');
    expect(picked720?.requestedFormats[0]?.url).toContain('_258.mp4');
    expect(picked720).toBeTruthy();
  });

  it('多档分辨率时仍弹窗', () => {
    const formats: Format[] = [
      fmt({ format_id: '720', height: 720, width: 1280, vcodec: 'avc1', acodec: 'none', tbr: 2000 }),
      fmt({ format_id: '360', height: 360, width: 640, vcodec: 'avc1', acodec: 'none', tbr: 800 }),
      fmt({ format_id: 'a', vcodec: 'none', acodec: 'mp4a', abr: 128 }),
    ];
    const ids = listAvailableQualityOptions(formats).map((o) => o.id);
    expect(ids).toContain('best');
    expect(ids).toContain('720');
    expect(ids).toContain('360');
    expect(shouldPromptQualityPick(formats)).toBe(true);
  });

  it('优酷式 m3u8（无 .m3u8 后缀、无 vcodec）不得识别为图片', () => {
    const formats: Format[] = [
      {
        format_id: 'mp4hd',
        url: 'https://pl-ali.youku.com/playlist/m3u8?vid=XNTA2NTA0MjA1Mg%3D%3D&type=mp4hd',
        ext: 'mp4',
        protocol: 'm3u8_native',
        width: 1280,
        height: 720,
      },
    ];
    expect(isImageFormat(formats[0]!)).toBe(false);
    expect(defaultQualityPreset(formats)).toBe('best');
    expect(kindForQuality(defaultQualityPreset(formats))).toBe('video');
    const ids = listAvailableQualityOptions(formats).map((o) => o.id);
    expect(ids.some((id) => String(id).startsWith('image'))).toBe(false);
  });
});
