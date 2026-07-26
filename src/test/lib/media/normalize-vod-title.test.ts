import { describe, expect, it } from 'vitest';
import {
  applyTitleMappingTable,
  cleanVodTitle,
  prepareVodSearchTitle,
} from '@/lib/media/video/danmaku/normalize-vod-title';
import { prepareDanmakuMatchQuery } from '@/lib/media/video/danmaku/match';

describe('cleanVodTitle', () => {
  it('strips quality / lang / site noise', () => {
    expect(cleanVodTitle('某某剧场版 高清 国语 www.foo.com')).toBe('某某剧场版');
    expect(cleanVodTitle('【独播】唐朝诡事录 1080P 完整版')).toBe('唐朝诡事录');
    expect(cleanVodTitle('更新至12集 某某第一季')).toBe('某某第一季');
  });

  it('strips trailing episode from title', () => {
    expect(cleanVodTitle('三体 第03集')).toBe('三体');
    expect(cleanVodTitle('三体 S01E03')).toBe('三体');
  });

  it('keeps meaningful season wording', () => {
    expect(cleanVodTitle('某某 第二季 蓝光')).toBe('某某 第二季');
  });
});

describe('applyTitleMappingTable', () => {
  it('maps exact and contains', () => {
    const table = '唐朝诡事录->唐朝诡事录之西行;国色芳华->锦绣芳华';
    expect(applyTitleMappingTable('唐朝诡事录', table)).toBe('唐朝诡事录之西行');
    expect(applyTitleMappingTable('国色芳华 高清', table)).toBe('锦绣芳华');
  });
});

describe('prepareVodSearchTitle', () => {
  it('cleans then maps', () => {
    const r = prepareVodSearchTitle('唐朝诡事录 高清', {
      mappingTable: '唐朝诡事录->唐朝诡事录之西行',
    });
    expect(r.cleaned).toBe('唐朝诡事录');
    expect(r.searchTitle).toBe('唐朝诡事录之西行');
    expect(r.changed).toBe(true);
  });
});

describe('prepareDanmakuMatchQuery', () => {
  it('builds cleaned fileNameHint with episode', () => {
    const q = prepareDanmakuMatchQuery({
      fileNameHint: '某某剧 高清 第5集',
      animeTitle: '某某剧 高清',
      episodeName: '第5集',
      episodeIndex: 4,
    });
    expect(q.searchTitle).toBe('某某剧');
    expect(q.episode).toBe(5);
    expect(q.fileNameHint).toContain('某某剧');
    expect(q.fileNameHint).toMatch(/S01E05/i);
  });
});
