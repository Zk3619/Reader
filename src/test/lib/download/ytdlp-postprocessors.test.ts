/**
 * Postprocessor surface — Convertor / Fixup / ModifyChapters / MetadataParser.
 */
import { describe, expect, it } from 'vitest';
import {
  defaultPostProcessors,
  FFmpegVideoConvertorPP,
  FFmpegVideoRemuxerPP,
  MetadataParserPP,
  ModifyChaptersPP,
  mergeRanges,
  removeRangesToKeepRanges,
} from '@/lib/download/ytdlp/postprocessors';
import {
  FFmpegFixupStretchedPP,
  FFmpegFixupTimestampPP,
} from '@/lib/download/ytdlp/postprocessors/fixup';

describe('PP registry', () => {
  it('includes convertors when options set', () => {
    const pps = defaultPostProcessors({
      quiet: true,
      recodevideo: 'mp4',
      remuxvideo: 'mkv',
      convertsubtitles: 'srt',
      convertthumbnails: 'jpg',
      parse_metadata: ['title:%(artist)s - %(title)s'],
    });
    const names = pps.map((p) => p.name);
    expect(names).toContain('FFmpegVideoConvertor');
    expect(names).toContain('FFmpegVideoRemuxer');
    expect(names).toContain('FFmpegSubtitlesConvertor');
    expect(names).toContain('FFmpegThumbnailsConvertor');
    expect(names).toContain('MetadataParser');
    expect(names).toContain('FFmpegFixupStretched');
    expect(names).toContain('FFmpegFixupTimestamp');
    expect(names).toContain('FFmpegFixupDuplicateMoov');
  });

  it('ModifyChapters registered for remove_chapters', () => {
    const pps = defaultPostProcessors({ quiet: true, remove_chapters: 'intro' });
    expect(pps.some((p) => p.name === 'ModifyChapters')).toBe(true);
  });
});

describe('MetadataParser', () => {
  it('interprets title into artist/title', async () => {
    const pp = new MetadataParserPP([
      { type: 'interpret', from: 'title', to: '%(artist)s - %(title)s' },
    ]);
    const info = { id: '1', title: 'Radiohead - Creep' };
    const out = await pp.run({
      info: info as never,
      filename: 'a.mp4',
      options: {},
    });
    expect(out.info.artist).toBe('Radiohead');
    expect(out.info.title).toBe('Creep');
  });

  it('replace action', async () => {
    const pp = new MetadataParserPP([
      { type: 'replace', field: 'title', search: ' ', replace: '_' },
    ]);
    const out = await pp.run({
      info: { id: '1', title: 'a b' } as never,
      filename: 'a.mp4',
      options: {},
    });
    expect(out.info.title).toBe('a_b');
  });
});

describe('cut ranges helpers', () => {
  it('merge + invert ranges', () => {
    expect(mergeRanges([[1, 3], [2, 5], [8, 9]])).toEqual([
      { start: 1, end: 5 },
      { start: 8, end: 9 },
    ]);
    expect(removeRangesToKeepRanges([[10, 20]], 30)).toEqual([
      { start: 0, end: 10 },
      { start: 20, end: 30 },
    ]);
  });
});

describe('Convertor / Fixup no-op', () => {
  it('VideoConvertor skips when already target', async () => {
    const pp = new FFmpegVideoConvertorPP('mp4');
    const out = await pp.run({
      info: { id: '1', ext: 'mp4', _filename: 'a.mp4' } as never,
      filename: 'a.mp4',
      options: { recodevideo: 'mp4' },
    });
    expect(out.filename).toBe('a.mp4');
  });

  it('VideoRemuxer skips when mapping null', async () => {
    const pp = new FFmpegVideoRemuxerPP(null);
    const out = await pp.run({
      info: { id: '1', ext: 'webm', _filename: 'a.webm' } as never,
      filename: 'a.webm',
      options: {},
    });
    expect(out.filename).toBe('a.webm');
  });

  it('FixupStretched no-ops without ratio', async () => {
    const pp = new FFmpegFixupStretchedPP();
    const out = await pp.run({
      info: { id: '1', _filename: 'a.mp4' } as never,
      filename: 'a.mp4',
      options: {},
    });
    expect(out.filename).toBe('a.mp4');
  });

  it('FixupTimestamp no-ops without websocket', async () => {
    const pp = new FFmpegFixupTimestampPP();
    const out = await pp.run({
      info: {
        id: '1',
        protocol: 'https',
        _filename: 'a.mp4',
        // 真实下载标记 ≠ 需要修时间戳（对齐 yt-dlp web_socket_fragment 条件）
        __real_download: true,
      } as never,
      filename: 'a.mp4',
      options: {},
    });
    expect(out.filename).toBe('a.mp4');
  });

  it('ModifyChapters no-ops without cuts', async () => {
    const pp = new ModifyChaptersPP();
    const out = await pp.run({
      info: { id: '1', _filename: 'a.mp4', chapters: [] } as never,
      filename: 'a.mp4',
      options: {},
    });
    expect(out.filename).toBe('a.mp4');
  });
});
