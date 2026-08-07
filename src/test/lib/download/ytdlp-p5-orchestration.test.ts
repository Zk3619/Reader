import { describe, expect, it } from 'vitest';
import { YoutubeDL, applyDefaultSearch } from '@/lib/download/ytdlp/youtube-dl';
import { DateRange, dateFromStr, resolveDateRange } from '@/lib/download/ytdlp/utils/daterange';
import { matchEntry, evaluateMatchFilterSpec } from '@/lib/download/ytdlp/match-entry';
import { processSubtitles } from '@/lib/download/ytdlp/process-subtitles';
import { resolveDownloadRanges, applyRangeToInfo } from '@/lib/download/ytdlp/download-ranges';
import { parseCookiesFromBrowser } from '@/lib/download/ytdlp/cookies-browser';
import { DownloadArchive } from '@/lib/download/ytdlp/archive';
import { MaxDownloadsReached, RejectedVideoReached } from '@/lib/download/ytdlp/common';
import type { VideoInfo } from '@/lib/download/ytdlp/types';

describe('daterange', () => {
  it('contains YYYYMMDD in range', () => {
    const r = new DateRange('20200101', '20201231');
    expect(r.contains('20200615')).toBe(true);
    expect(r.contains('20190101')).toBe(false);
  });

  it('parses today-relative', () => {
    const ymd = dateFromStr('today');
    expect(ymd).toMatch(/^\d{8}$/);
  });

  it('resolveDateRange from string START:END', () => {
    const r = resolveDateRange('20220101:20220131');
    expect(r?.contains('20220115')).toBe(true);
  });
});

describe('match_entry', () => {
  const archive = new DownloadArchive(new Set());

  it('rejects by matchtitle', () => {
    const { reason } = matchEntry(
      { id: '1', title: 'Hello World' },
      { matchtitle: 'bye' },
      archive,
    );
    expect(reason).toMatch(/did not match/i);
  });

  it('rejects by min_views', () => {
    const { reason } = matchEntry(
      { id: '1', title: 't', view_count: 10 },
      { min_views: 100 },
      archive,
    );
    expect(reason).toMatch(/minimum view/i);
  });

  it('evaluateMatchFilterSpec title*=', () => {
    expect(
      evaluateMatchFilterSpec('title*=foo', { id: '1', title: 'bar foo baz' }),
    ).toBeNull();
    expect(
      evaluateMatchFilterSpec('title*=zzz', { id: '1', title: 'bar' }),
    ).toMatch(/does not match/);
  });
});

describe('process_subtitles', () => {
  it('selects lang from subtitleslangs', () => {
    const info: VideoInfo = {
      id: 'v',
      subtitles: {
        en: [{ ext: 'vtt', url: 'https://x/en.vtt' }],
        ja: [{ ext: 'vtt', url: 'https://x/ja.vtt' }],
      },
    };
    const subs = processSubtitles('v', info, {
      writesubtitles: true,
      subtitleslangs: ['ja'],
    });
    expect(subs).toHaveProperty('ja');
    expect(subs).not.toHaveProperty('en');
  });
});

describe('download_ranges', () => {
  it('defaults to full video', () => {
    expect(resolveDownloadRanges({ id: '1' }, {}, null)).toEqual([{}]);
  });

  it('applies section fields', () => {
    const info = applyRangeToInfo(
      { id: '1', duration: 100 },
      { start_time: 10, end_time: 40, title: 'Intro' },
    );
    expect(info.section_start).toBe(10);
    expect(info.section_end).toBe(40);
    expect(info.section_title).toBe('Intro');
  });
});

describe('cookiesfrombrowser parse', () => {
  it('parses chrome:Profile', () => {
    const s = parseCookiesFromBrowser('chrome:Default');
    expect(s?.browser).toBe('chrome');
    expect(s?.profile).toBe('Default');
  });
});

describe('YoutubeDL orchestration', () => {
  it('listformats + simulate list_only does not download', async () => {
    const ydl = new YoutubeDL({
      quiet: true,
      no_warnings: true,
      listformats: true,
    });
    const info = await ydl.process_video_result(
      {
        id: 'vid',
        title: 'T',
        formats: [
          { format_id: '18', url: 'https://example.com/a.mp4', ext: 'mp4', height: 360 },
          { format_id: '22', url: 'https://example.com/b.mp4', ext: 'mp4', height: 720 },
        ],
      },
      true,
    );
    expect(info.formats_table).toMatch(/18/);
    expect(ydl.params.simulate).toBe('list_only');
  });

  it('filters DRM unless allow_unplayable_formats', async () => {
    const ydl = new YoutubeDL({ quiet: true, no_warnings: true });
    const info = await ydl.process_video_result(
      {
        id: 'drm',
        title: 'D',
        formats: [
          { format_id: '1', url: 'https://example.com/ok.mp4', ext: 'mp4' },
          { format_id: '2', url: 'https://example.com/bad.mp4', ext: 'mp4', has_drm: true },
        ],
      },
      false,
    );
    expect(info.formats?.every((f) => !f.has_drm)).toBe(true);
  });

  it('matchtitle with break_on_reject throws RejectedVideoReached', async () => {
    const ydl = new YoutubeDL({
      quiet: true,
      no_warnings: true,
      matchtitle: 'zzz',
      break_on_reject: true,
    });
    await expect(
      ydl.process_video_result(
        {
          id: '1',
          title: 'Hello',
          formats: [{ format_id: '0', url: 'https://example.com/a.mp4', ext: 'mp4' }],
        },
        false,
      ),
    ).rejects.toBeInstanceOf(RejectedVideoReached);
  });

  it('max_downloads stops download()', async () => {
    const ydl = new YoutubeDL({
      quiet: true,
      no_warnings: true,
      max_downloads: 0,
      ignoreerrors: true,
    });
    // max_downloads 0 → first check throws before any
    await expect(ydl.download(['https://example.com/x'])).rejects.toBeInstanceOf(
      MaxDownloadsReached,
    );
  });

  it('playlistreverse reverses entries when extract_flat', async () => {
    const ydl = new YoutubeDL({
      quiet: true,
      no_warnings: true,
      extract_flat: true,
      playlistreverse: true,
    });
    const pl = await ydl.process_ie_result(
      {
        id: 'pl',
        title: 'P',
        _type: 'playlist',
        entries: [
          { id: 'a', title: 'A', url: 'https://example.com/a', _type: 'url' },
          { id: 'b', title: 'B', url: 'https://example.com/b', _type: 'url' },
        ],
      },
      false,
    );
    expect(pl?.entries?.[0]?.id).toBe('b');
    expect(pl?.entries?.[1]?.id).toBe('a');
  });

  it('download_ranges sets section_* on info', async () => {
    const ydl = new YoutubeDL({
      quiet: true,
      no_warnings: true,
      download_ranges: [{ start_time: 5, end_time: 15, title: 'Clip' }],
      force_keyframes_at_cuts: true,
    });
    const info = await ydl.process_video_result(
      {
        id: 'r',
        title: 'R',
        duration: 60,
        formats: [{ format_id: '0', url: 'https://example.com/a.mp4', ext: 'mp4' }],
      },
      false,
    );
    expect(info.section_start).toBe(5);
    expect(info.section_end).toBe(15);
    expect(info.force_keyframes_at_cuts).toBe(true);
  });

  it('prefer_free_formats reorders free containers first', async () => {
    const ydl = new YoutubeDL({
      quiet: true,
      no_warnings: true,
      prefer_free_formats: true,
      format: 'best',
    });
    const info = await ydl.process_video_result(
      {
        id: 'pf',
        title: 'P',
        formats: [
          { format_id: 'mp4', url: 'https://example.com/a.mp4', ext: 'mp4', height: 720 },
          { format_id: 'webm', url: 'https://example.com/a.webm', ext: 'webm', height: 720, vcodec: 'vp9' },
        ],
      },
      false,
    );
    expect(info.formats?.[0]?.ext).toBe('webm');
  });

  it('default_search prefixes bare query', () => {
    expect(applyDefaultSearch('funny cats', 'ytsearch')).toBe('ytsearch:funny cats');
    expect(applyDefaultSearch('https://example.com/x', 'ytsearch')).toBe('https://example.com/x');
  });

  it('attachDownloaderOptions sets __downloader_options', async () => {
    const ydl = new YoutubeDL({
      quiet: true,
      no_warnings: true,
      ratelimit: 1024,
      continuedl: true,
      download_ranges: [{ start_time: 1, end_time: 2 }],
    });
    const info = await ydl.process_video_result(
      {
        id: 'dl',
        title: 'D',
        duration: 10,
        formats: [{ format_id: '0', url: 'https://example.com/a.mp4', ext: 'mp4' }],
      },
      false,
    );
    expect(info.__downloader_options).toMatchObject({
      ratelimit: 1024,
      continuedl: true,
      section_start: 1,
      section_end: 2,
    });
  });

  it('break_per_url option is honored by download loop length', async () => {
    const ydl = new YoutubeDL({
      quiet: true,
      no_warnings: true,
      break_per_url: true,
      skip_download: true,
      simulate: true,
    });
    let calls = 0;
    ydl.extract_info = async () => {
      calls += 1;
      return { id: String(calls), title: 't' };
    };
    const results = await ydl.download(['https://a.example/1', 'https://a.example/2']);
    expect(calls).toBe(1);
    expect(results).toHaveLength(1);
  });
});
