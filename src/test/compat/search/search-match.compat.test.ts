import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { BookSource } from '@/types';
import {
  buildSearchBookFilter,
  classifySearchResult,
  continuousContains,
  matchesSearchMode,
  shouldIncludeOtherBucket,
} from '@/lib/search/search-match';
import { MultiSourceSearchSession } from '@/lib/book-source/multi-source-search';
import * as searchModule from '@/lib/book-source/search';

describe('search-match', () => {
  const fields = {
    name: '穿越重生之我不显天生败类',
    author: '张三',
    kind: '都市言情',
    intro: '一段关于修仙的故事',
  };

  it('常规：书名/作者须连续包含关键词', () => {
    expect(matchesSearchMode(fields, '我不显', 'name')).toBe(true);
    expect(matchesSearchMode(fields, '天生败类', 'name')).toBe(true);
    expect(matchesSearchMode(fields, '张三', 'name')).toBe(true);
    expect(matchesSearchMode(fields, '修仙', 'name')).toBe(false);
    expect(matchesSearchMode(fields, '我不 显', 'name')).toBe(false);
    expect(continuousContains('abc', 'ab')).toBe(true);
  });

  it('模糊：书名/作者字符序匹配，可不连续', () => {
    expect(matchesSearchMode({ name: '催眠超女系统', author: 'a' }, '催系', 'fuzzy')).toBe(true);
    expect(matchesSearchMode(fields, '穿越败', 'fuzzy')).toBe(true);
    expect(matchesSearchMode(fields, '修仙', 'fuzzy')).toBe(false);
  });

  it('扩展：模糊匹配书名/作者/分类/简介', () => {
    expect(matchesSearchMode(fields, '修仙', 'extended')).toBe(true);
    expect(matchesSearchMode(fields, '都市', 'extended')).toBe(true);
    expect(matchesSearchMode(fields, '完全不相关', 'extended')).toBe(false);
  });

  it('分桶：扩展模式区分标签与简介命中', () => {
    expect(classifySearchResult(fields, '我不显', 'extended')).toBe('contains');
    expect(classifySearchResult(fields, '都市', 'extended')).toBe('tags');
    expect(
      classifySearchResult(
        { name: '其他书', author: 'a', intro: '这里有修仙情节' },
        '修仙',
        'extended',
      ),
    ).toBe('other');
  });

  it('buildSearchBookFilter 与 matchesSearchMode 一致', () => {
    const filter = buildSearchBookFilter('name', '我不显');
    expect(filter(fields.name, fields.author, fields.kind, fields.intro)).toBe(true);
    expect(filter('其他', '李四', undefined, undefined)).toBe(false);
  });

  it('shouldIncludeOtherBucket 扩展与不过滤为 true', () => {
    expect(shouldIncludeOtherBucket('name')).toBe(false);
    expect(shouldIncludeOtherBucket('fuzzy')).toBe(false);
    expect(shouldIncludeOtherBucket('extended')).toBe(true);
    expect(shouldIncludeOtherBucket('unfiltered')).toBe(true);
  });

  it('不过滤：源内恒通过，分桶仍按 Legado contains 排序', () => {
    expect(matchesSearchMode({ name: '完全无关', author: 'a' }, '我不显', 'unfiltered')).toBe(true);
    const filter = buildSearchBookFilter('unfiltered', '我不显');
    expect(filter('完全无关', 'a')).toBe(true);
    expect(
      classifySearchResult(
        { name: '我获得了熟女好感度系统', author: 'b' },
        '我不显',
        'unfiltered',
      ),
    ).toBe('other');
    expect(
      classifySearchResult({ name: '我不显坏女孩', author: 'a' }, '我不显', 'unfiltered'),
    ).toBe('contains');
  });
});

describe('MultiSourceSearchSession filter by mode', () => {
  const SOURCE = {
    bookSourceUrl: 'https://example.com/',
    sourceUrl: 'https://example.com/',
    bookSourceName: 'test',
    bookSourceType: 0,
    enabled: true,
    loginUrl: '',
    searchUrl: '/s?q={{key}}',
    ruleSearch: { bookList: 'li', name: 'a@text', bookUrl: 'a@href' },
  } as unknown as BookSource;

  beforeEach(() => {
    vi.stubGlobal('window', {});
    vi.spyOn(searchModule, 'searchBook').mockResolvedValue([
      {
        bookUrl: '/1',
        name: '我不显坏女孩',
        author: 'a',
        origin: 'https://example.com/',
        originName: 'test',
        type: 0,
        tocUrl: '/1',
        time: 0,
        originOrder: 0,
        chapterWordCount: -1,
        respondTime: -1,
      },
      {
        bookUrl: '/2',
        name: '我获得了熟女好感度系统',
        author: 'b',
        origin: 'https://example.com/',
        originName: 'test',
        type: 0,
        tocUrl: '/2',
        time: 0,
        originOrder: 0,
        chapterWordCount: -1,
        respondTime: -1,
      },
    ]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('常规模式过滤掉书名/作者不含关键词的结果', async () => {
    const session = new MultiSourceSearchSession();
    session.setSearchMode('name');
    await session.search('我不显', [SOURCE]);
    expect(session.getResults().map((b) => b.name)).toEqual(['我不显坏女孩']);
  });

  it('扩展模式保留仅简介命中的结果', async () => {
    vi.mocked(searchModule.searchBook).mockResolvedValue([
      {
        bookUrl: '/3',
        name: '其他书',
        author: 'c',
        intro: '关键词修仙在这里',
        origin: 'https://example.com/',
        originName: 'test',
        type: 0,
        tocUrl: '/3',
        time: 0,
        originOrder: 0,
        chapterWordCount: -1,
        respondTime: -1,
      },
    ]);
    const session = new MultiSourceSearchSession();
    session.setSearchMode('extended');
    await session.search('修仙', [SOURCE]);
    expect(session.getResults()).toHaveLength(1);
    expect(session.getResults()[0]?.name).toBe('其他书');
  });

  it('不过滤模式保留书源返回的不含关键词结果', async () => {
    const session = new MultiSourceSearchSession();
    session.setSearchMode('unfiltered');
    await session.search('我不显', [SOURCE]);
    expect(session.getResults().map((b) => b.name)).toEqual([
      '我不显坏女孩',
      '我获得了熟女好感度系统',
    ]);
  });
});
