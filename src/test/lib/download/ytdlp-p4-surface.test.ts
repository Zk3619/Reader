/**
 * P4 surface — process_ie_result, sidecars, filters, utils, bili formats, rename/archive helpers.
 */
import { describe, expect, it } from 'vitest';
import { YoutubeDL } from '@/lib/download/ytdlp/youtube-dl';
import { js_to_json, get_first, traverse_obj } from '@/lib/download/ytdlp/utils';
import {
  parseBiliPlayFormats,
  biliAudioContainerMeta,
} from '@/lib/download/ytdlp/extractors/bilibili-shared';
import { biliDanmakuEntries } from '@/lib/download/ytdlp/extractors/bilibili-subs';
import { uniquifyAgainstSet, nextUniqueCandidate } from '@/lib/download/gopeed/unique-path';
import {
  listExpectedVolumePaths,
  resolveArchivePrimaryPath,
  isArchiveFile,
} from '@/lib/download/gopeed/archive';

describe('P4 unique path', () => {
  it('uniquifyAgainstSet', () => {
    const taken = new Set(['a/video.mp4']);
    expect(uniquifyAgainstSet('a/video.mp4', taken)).toBe('a/video (1).mp4');
    expect(nextUniqueCandidate('x.mp4', 2)).toBe('x (2).mp4');
  });
});

describe('P4 archive volumes', () => {
  it('detects multi-volume patterns', () => {
    expect(isArchiveFile('foo.zip.001')).toBe(true);
    const { primary } = resolveArchivePrimaryPath('D:/dl/foo.zip.003');
    expect(primary.toLowerCase().endsWith('foo.zip.001')).toBe(true);
    expect(listExpectedVolumePaths('D:/dl/foo.zip.002').length).toBeGreaterThanOrEqual(2);
  });
});

describe('P4 utils', () => {
  it('js_to_json handles comments and unquoted keys', () => {
    const raw = `{
      // comment
      foo: 'bar',
      n: 1,
    }`;
    const json = js_to_json(raw);
    expect(JSON.parse(json)).toEqual({ foo: 'bar', n: 1 });
  });

  it('js_to_json maps undefined / void 0 to null (XiaoHongShu __INITIAL_STATE__)', () => {
    const raw = `{opPrompt:undefined,x:void 0,keep:"has undefined word"}`;
    expect(JSON.parse(js_to_json(raw))).toEqual({
      opPrompt: null,
      x: null,
      keep: 'has undefined word',
    });
  });

  it('get_first / traverse_obj', () => {
    const obj = { a: { b: 1 }, c: null };
    expect(traverse_obj(obj, ['a', 'b'])).toBe(1);
    expect(get_first(obj, [['c'], ['a', 'b']])).toBe(1);
  });
});

describe('P4 bili formats', () => {
  it('parses dolby/flac audio', () => {
    const formats = parseBiliPlayFormats({
      dash: {
        video: [],
        audio: [{ id: 30280, baseUrl: 'https://a.example/a.m4s', bandwidth: 320000, codecs: 'mp4a' }],
        dolby: {
          audio: [{ id: 30250, baseUrl: 'https://a.example/dolby.m4s', bandwidth: 768000, codecs: 'ec-3' }],
        },
        flac: { audio: { id: 30252, baseUrl: 'https://a.example/flac.m4s', bandwidth: 1411000, codecs: 'flac' } },
      },
    });
    const ids = formats.map((f) => f.format_id);
    expect(ids.some((id) => id?.includes('30250'))).toBe(true);
    expect(ids.some((id) => id?.includes('30252'))).toBe(true);
    expect(biliAudioContainerMeta(30252).ext).toBe('flac');
  });

  it('danmaku prefers seg + xml fallback', () => {
    const entries = biliDanmakuEntries(123, '456');
    expect(entries.length).toBe(2);
    expect(entries[0]?.url).toMatch(/seg\.so/);
    expect(entries[1]?.url).toMatch(/comment\.bilibili\.com/);
  });
});

describe('P4 YoutubeDL process_ie_result / filters', () => {
  it('process_ie_result extract_flat playlist keeps url entries', async () => {
    const ydl = new YoutubeDL({ quiet: true, no_warnings: true, extract_flat: true });
    const r = await ydl.process_ie_result(
      {
        _type: 'playlist',
        id: 'pl',
        title: 'PL',
        entries: [
          { _type: 'url', id: 'a', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa', title: 'A' },
          { _type: 'url', id: 'b', url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb', title: 'B' },
        ],
      },
      false,
    );
    expect(r?._type).toBe('playlist');
    expect(r?.entries?.length).toBe(2);
  });

  it('age_limit rejects', async () => {
    const ydl = new YoutubeDL({ quiet: true, no_warnings: true, age_limit: 12 });
    await expect(
      ydl.process_video_result(
        {
          id: '1',
          title: 'x',
          age_limit: 18,
          formats: [{ format_id: '0', url: 'https://example.com/a.mp4', ext: 'mp4' }],
        },
        false,
      ),
    ).rejects.toThrow(/age/i);
  });
});
