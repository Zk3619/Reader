/**
 * 片名解析 / 识别词 / 采样去重 单测
 */

import { describe, expect, it } from 'vitest';
import {
  extractSeasonFromTitle,
  formatSeasonEpisodeCode,
  normalizeTitleSeason,
  parseSearchKeyword,
} from '@/lib/media/video/danmaku/title-parse';
import {
  applySearchPreprocessing,
  parseRecognitionRules,
} from '@/lib/media/video/danmaku/recognition';
import {
  dedupeDanmakuByTimeText,
  postProcessDanmakuList,
  sampleDanmakuEvenly,
} from '@/lib/media/video/danmaku/sample';
import type { Danmu } from 'artplayer-plugin-danmuku';

describe('title-parse', () => {
  it('parses S01E02', () => {
    const r = parseSearchKeyword('遮天 S01E02');
    expect(r.title).toBe('遮天');
    expect(r.season).toBe(1);
    expect(r.episode).toBe(2);
  });

  it('parses Chinese season suffix', () => {
    const r = parseSearchKeyword('从零开始的异世界生活 第三季');
    expect(r.title).toBe('从零开始的异世界生活');
    expect(r.season).toBe(3);
  });

  it('extractSeasonFromTitle and normalize', () => {
    expect(extractSeasonFromTitle('金牌得主 第二季')).toBe(2);
    expect(normalizeTitleSeason('Re：从零 第三季')).toContain('Re');
    expect(formatSeasonEpisodeCode(2, 5)).toBe('S02E05');
  });
});

describe('recognition', () => {
  it('parses replace and block rules', () => {
    const { rules } = parseRecognitionRules('BLOCK:无修\n原名 => 标准名\n');
    expect(rules).toHaveLength(2);
    expect(rules[0]).toMatchObject({ type: 'block', word: '无修' });
    expect(rules[1]).toMatchObject({
      type: 'replace',
      source: '原名',
      target: '标准名',
    });
  });

  it('applies preprocess replace', () => {
    const r = applySearchPreprocessing('原名 第一季', 1, 1, '原名 => 标准名');
    expect(r.text).toContain('标准名');
    expect(r.changed).toBe(true);
  });

  it('applies season_offset metadata', () => {
    const r = applySearchPreprocessing(
      '某剧',
      1,
      1,
      '某剧 => {[season_offset=1>2;title=正确名]}',
    );
    expect(r.text).toBe('正确名');
    expect(r.season).toBe(2);
  });
});

describe('sample / dedupe', () => {
  const make = (n: number): Danmu[] =>
    Array.from({ length: n }, (_, i) => ({
      text: i % 3 === 0 ? '草' : `msg${i}`,
      time: i * 10,
      mode: 0 as const,
    }));

  it('dedupes by time+text', () => {
    const list: Danmu[] = [
      { text: '草', time: 1.04, mode: 0 },
      { text: '草', time: 1.02, mode: 0 }, // 同为 1.0 一位小数
      { text: '好', time: 1.04, mode: 0 },
    ];
    const out = dedupeDanmakuByTimeText(list);
    expect(out).toHaveLength(2);
  });

  it('samples evenly under limit', () => {
    const out = sampleDanmakuEvenly(make(200), 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.length).toBeGreaterThan(0);
  });

  it('postProcess respects dedupe flag', () => {
    const list: Danmu[] = [
      { text: 'a', time: 1.0, mode: 0 },
      { text: 'a', time: 1.0, mode: 0 },
    ];
    expect(postProcessDanmakuList(list, { dedupe: false })).toHaveLength(2);
    expect(postProcessDanmakuList(list, { dedupe: true })).toHaveLength(1);
  });
});
