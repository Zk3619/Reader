/**
 * prepareDanmuList / normalize 时间语义单测
 */

import { describe, expect, it } from 'vitest';
import { prepareDanmuList } from '@/lib/media/video/danmaku/art-danmuku';
import {
  coerceToArtplayerDanmu,
  normalizeDanmuForArtplayer,
  parseDanmuPField,
  spreadDuplicateDanmakuTimes,
} from '@/lib/media/video/danmaku/to-artplayer';
import type { Danmu } from 'artplayer-plugin-danmuku';

describe('parseDanmuPField', () => {
  it('parses short 4-field p', () => {
    const r = parseDanmuPField('12.34,1,16777215,[qq]');
    expect(r.time).toBeCloseTo(12.34);
    expect(r.mode).toBe(0);
    expect(r.platform).toBe('qq');
  });

  it('parses bilibili 8-field p color at index 3', () => {
    const r = parseDanmuPField('10.5,5,25,16711680,0,0,0,0');
    expect(r.time).toBeCloseTo(10.5);
    expect(r.mode).toBe(1); // top
    expect(r.color).toBe('#ff0000');
  });
});

describe('coerceToArtplayerDanmu', () => {
  it('converts {comments:[{p,m}]}', () => {
    const out = coerceToArtplayerDanmu({
      comments: [
        { p: '60,1,16777215,[qq]', m: 'hello' },
        { p: '60,1,16777215,[qq]', m: 'world' },
        { p: '120.5,5,25,255,0,0,0,0', m: 'top' },
      ],
    });
    expect(out.some((d) => d.text === 'hello')).toBe(true);
    expect(out.some((d) => d.text === 'top' && d.mode === 1)).toBe(true);
    // 同秒错开：不再全部停在 60
    const at60 = out.filter((d) => d.text === 'hello' || d.text === 'world');
    expect(at60.map((d) => d.time)).not.toEqual([60, 60]);
  });

  it('accepts already-converted Danmu[]', () => {
    const out = coerceToArtplayerDanmu([
      { text: 'a', time: 1, mode: 0 },
      { text: 'b', time: 2, mode: 1 },
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((d) => d.text === 'b')?.mode).toBe(1);
  });

  it('accepts timepoint/content intermediate', () => {
    const out = coerceToArtplayerDanmu([
      { content: 'x', timepoint: 3.5, ct: 1, color: 16777215 },
    ]);
    expect(out[0]?.text).toBe('x');
    expect(out[0]?.time).toBeCloseTo(3.5);
  });
});

describe('spreadDuplicateDanmakuTimes', () => {
  it('randomly spreads identical seconds (not uniform staircase)', () => {
    const list = Array.from({ length: 10 }, (_, i) => ({
      text: `m${i}`,
      time: 60,
      mode: 0 as const,
    }));
    const out = spreadDuplicateDanmakuTimes(list);
    const times = out.map((d) => Number(d.time)).sort((a, b) => a - b);
    expect(new Set(times.map((t) => t.toFixed(4))).size).toBeGreaterThan(5);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(60);
    expect(Math.max(...times)).toBeLessThan(61);
    // 非均匀：相邻间距不应接近常数
    const gaps = times.slice(1).map((t, i) => t - times[i]!);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const variance =
      gaps.reduce((a, g) => a + (g - avg) ** 2, 0) / gaps.length;
    expect(variance).toBeGreaterThan(1e-6);
  });

  it('is stable for the same inputs (seek-reproducible)', () => {
    const list = [
      { text: '甲', time: 10, mode: 0 as const },
      { text: '乙', time: 10, mode: 0 as const },
      { text: '丙', time: 10, mode: 0 as const },
    ];
    const a = spreadDuplicateDanmakuTimes(list).map((d) => d.time);
    const b = spreadDuplicateDanmakuTimes(list).map((d) => d.time);
    expect(a).toEqual(b);
  });
});

describe('normalizeDanmuForArtplayer', () => {
  it('keeps timed comments and lifts time=0 to truthy', () => {
    const out = normalizeDanmuForArtplayer([
      { text: 'a', time: 0 },
      { text: 'b', time: 606 },
      { text: 'c', time: 1320 },
      { text: '', time: 1 },
    ] as Danmu[]);
    expect(out.map((d) => d.text)).toEqual(['a', 'b', 'c']);
    expect(out[0]!.time).toBeGreaterThan(0);
  });

  it('drops invalid times', () => {
    const out = normalizeDanmuForArtplayer([
      { text: 'x', time: Number.NaN },
      { text: 'y' } as Danmu,
    ]);
    expect(out).toEqual([]);
  });
});

describe('prepareDanmuList', () => {
  it('keeps valid timed comments after normalize', () => {
    const list = [
      { text: 'late', time: 900 },
      { text: 'early', time: 10 },
      { text: 'mid', time: 606 },
    ] as Danmu[];
    const out = prepareDanmuList(list);
    expect(out).toHaveLength(3);
    expect(new Set(out.map((d) => d.text))).toEqual(new Set(['early', 'mid', 'late']));
  });
});
