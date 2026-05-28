import { describe, expect, it } from 'vitest';
import {
  buildPreciseSearchFilter,
  formatWordCountLikeLegado,
  normalizeAuthorText,
  normalizeBookNameText,
  shouldFallbackToDetailParsing,
} from '@/lib/book-source/search-format';

describe('search format compatibility', () => {
  it('normalizes author like legado BookHelp.authorRegex', () => {
    expect(normalizeAuthorText('作者：张三 著')).toBe('张三');
    expect(normalizeAuthorText('  作 者: 李四  ')).toBe('李四');
  });

  it('normalizes book name like legado BookHelp.nameRegex', () => {
    expect(normalizeBookNameText('我的书 作者：张三')).toBe('我的书');
    expect(normalizeBookNameText('我的书 张三 著')).toBe('我的书');
  });

  it('formats word count like legado StringUtils.wordCountFormat', () => {
    expect(formatWordCountLikeLegado('12000')).toBe('1.2万字');
    expect(formatWordCountLikeLegado('9999')).toBe('9999字');
    expect(formatWordCountLikeLegado('abc字数')).toBe('abc字数');
    expect(formatWordCountLikeLegado('0')).toBe('');
  });

  it('appends 字 when source already uses 万 unit without 字', () => {
    expect(formatWordCountLikeLegado('1万')).toBe('1万字');
    expect(formatWordCountLikeLegado('1.2万')).toBe('1.2万字');
    expect(formatWordCountLikeLegado('1万字')).toBe('1万字');
    expect(formatWordCountLikeLegado('10w')).toBe('10万字');
  });

  it('builds precise-search filter with normalized equality', () => {
    const filter = buildPreciseSearchFilter('我的书 作者：张三', '作者：张三 著');
    expect(filter('我的书', '张三')).toBe(true);
    expect(filter('我的书', '李四')).toBe(false);
  });

  it('disables detail fallback when bookUrlPattern exists', () => {
    expect(shouldFallbackToDetailParsing(undefined)).toBe(true);
    expect(shouldFallbackToDetailParsing('')).toBe(true);
    expect(shouldFallbackToDetailParsing('^https://example.com/book/\\d+$')).toBe(false);
  });
});
