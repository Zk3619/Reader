import { describe, expect, it } from 'vitest';
import {
  parsePlayQualities,
  pickPlayUrl,
  mapPlayUrlField,
  defaultQualityIndex,
} from '@/lib/media/tv/play/parse-play-qualities';

describe('parsePlayQualities', () => {
  it('parses alternating name/url array (FongMi UrlAdapter)', () => {
    const list = parsePlayQualities([
      '1080P 高码率',
      'https://a/m.m3u8',
      '720P 准高清',
      'https://b/m.m3u8',
    ]);
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({ name: '1080P 高码率', url: 'https://a/m.m3u8' });
    expect(list[1]?.name).toBe('720P 准高清');
    expect(pickPlayUrl([
      '1080P 高码率',
      'https://a/m.m3u8',
      '720P 准高清',
      'https://b/m.m3u8',
    ], 0)).toBe('https://a/m.m3u8');
  });

  it('pairs without requiring media-url heuristics on the url slot', () => {
    const list = parsePlayQualities(['超清', 'proxy://do=http&url=xx', '高清', 'thunder://abc']);
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({ name: '超清', url: 'proxy://do=http&url=xx' });
    expect(list[1]?.url).toBe('thunder://abc');
  });

  it('drops trailing odd element like FongMi', () => {
    const list = parsePlayQualities(['A', 'https://a.mp4', 'orphan-name']);
    expect(list).toHaveLength(1);
    expect(list[0]?.url).toBe('https://a.mp4');
  });

  it('parses FongMi Url object', () => {
    const list = parsePlayQualities({
      values: [
        { n: '蓝光', v: 'https://a.m3u8' },
        { n: '', v: 'https://b.m3u8' },
      ],
      position: 1,
    });
    expect(list).toHaveLength(2);
    expect(list[0]?.name).toBe('蓝光');
    expect(list[1]?.name).toBe('画质2');
    expect(defaultQualityIndex({ values: [{ n: 'a', v: 'https://a' }], position: 1 })).toBe(1);
    expect(pickPlayUrl({ values: [{ n: '蓝光', v: 'https://a.m3u8' }, { n: '高清', v: 'https://b.m3u8' }], position: 1 }, 1)).toBe(
      'https://b.m3u8',
    );
  });

  it('parses dollar items', () => {
    const list = parsePlayQualities(['超清$https://a.mp4', '高清$https://b.mp4']);
    expect(list.map((q) => q.name)).toEqual(['超清', '高清']);
  });

  it('parses hash-joined string', () => {
    const list = parsePlayQualities('超清$https://a.mp4#高清$https://b.mp4');
    expect(list).toHaveLength(2);
    expect(pickPlayUrl('超清$https://a.mp4#高清$https://b.mp4', 1)).toBe(
      'https://b.mp4',
    );
  });

  it('returns single url as one quality', () => {
    const list = parsePlayQualities('https://cdn.example/v.m3u8');
    expect(list).toHaveLength(1);
    expect(list[0]?.url).toContain('m3u8');
  });

  it('mapPlayUrlField only rewrites real urls', () => {
    const mapped = mapPlayUrlField(
      ['1080P', 'https://a/m.m3u8', '720P', 'https://b/m.m3u8'],
      (u) => `proxy:${u}`,
    );
    expect(mapped).toEqual([
      '1080P',
      'proxy:https://a/m.m3u8',
      '720P',
      'proxy:https://b/m.m3u8',
    ]);
  });
});
