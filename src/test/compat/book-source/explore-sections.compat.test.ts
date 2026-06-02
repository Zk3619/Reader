import { describe, expect, it } from 'vitest';
import type { BookSource } from '@/types';
import {
  getExploreSections,
  parseNameUrlExploreSections,
} from '@/lib/book-source/explore-sections';

describe('explore sections name::url syntax', () => {
  it('parses newline-separated Legado exploreUrl entries', () => {
    const text = [
      '分类1::https://example.com/cat1',
      '分类2::/shuku/2-lastupdate-0-{{page}}.html',
    ].join('\n');
    expect(parseNameUrlExploreSections(text)).toEqual([
      { title: '分类1', url: 'https://example.com/cat1' },
      { title: '分类2', url: '/shuku/2-lastupdate-0-{{page}}.html' },
    ]);
  });

  it('parses && separated entries', () => {
    expect(
      parseNameUrlExploreSections('玄幻::/x.html&&都市::/y.html'),
    ).toEqual([
      { title: '玄幻', url: '/x.html' },
      { title: '都市', url: '/y.html' },
    ]);
  });

  it('ignores script and json exploreUrl shapes', () => {
    expect(parseNameUrlExploreSections('<js>JSON.stringify([])</js>')).toBeNull();
    expect(parseNameUrlExploreSections('[{"title":"a","url":"/a"}]')).toBeNull();
    expect(parseNameUrlExploreSections('https://example.com/list')).toBeNull();
  });

  it('getExploreSections prefers name::url over single fallback', () => {
    const source = {
      sourceUrl: 'https://example.com/',
      sourceName: '示例',
      exploreUrl: '推荐::/hot.html\n完结::/done.html',
      ruleExplore: { bookList: '.book' },
    } as BookSource;

    expect(getExploreSections(source)).toEqual([
      { title: '推荐', url: '/hot.html' },
      { title: '完结', url: '/done.html' },
    ]);
  });
});
