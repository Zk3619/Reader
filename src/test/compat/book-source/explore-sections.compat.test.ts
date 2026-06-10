import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BookSource } from '@/types';
import {
  augmentExploreServerSelectSections,
  getExploreSections,
  getExploreSectionSelectDisplayValue,
  isExploreUrlScript,
  parseNameUrlExploreSections,
  readExploreSourceArgumentValue,
  updateExploreSourceArgument,
} from '@/lib/book-source/explore-sections';
import { getSourceArgsKey } from '@/lib/js-engine/legado/source-script-shared';

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
    expect(parseNameUrlExploreSections('@js:\nJSON.stringify([])')).toBeNull();
    expect(parseNameUrlExploreSections('[{"title":"a","url":"/a"}]')).toBeNull();
    expect(parseNameUrlExploreSections('https://example.com/list')).toBeNull();
  });

  it('isExploreUrlScript recognizes @js: prefix', () => {
    expect(isExploreUrlScript('<js>JSON.stringify([])</js>')).toBe(true);
    expect(isExploreUrlScript('@js:\nJSON.stringify([])')).toBe(true);
    expect(isExploreUrlScript('https://example.com/list')).toBe(false);
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

describe('explore section select display value', () => {
  const source = {
    bookSourceUrl: 'https://example.com',
    sourceUrl: 'https://example.com',
    sourceName: '示例',
  } as BookSource;

  const ls = new Map<string, string>();

  afterEach(() => {
    vi.unstubAllGlobals();
    ls.clear();
  });

  it('prefers localStorage param over script default', () => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => ls.get(k) ?? null,
      setItem: (k: string, v: string) => ls.set(k, v),
      removeItem: (k: string) => ls.delete(k),
    });

    updateExploreSourceArgument(source, 'find_tab', '听书');
    expect(readExploreSourceArgumentValue(source, 'find_tab')).toBe('听书');
    expect(
      getExploreSectionSelectDisplayValue(source, {
        title: '模式',
        type: 'select',
        chars: ['小说', '听书'],
        default: '小说',
        paramKey: 'find_tab',
      }),
    ).toBe('听书');
    expect(ls.has(getSourceArgsKey(source))).toBe(true);
  });

  it('augmentExploreServerSelectSections 将当前线路移到 chars 首位', () => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => ls.get(k) ?? null,
      setItem: (k: string, v: string) => ls.set(k, v),
      removeItem: (k: string) => ls.delete(k),
    });

    const ip = 'http://101.35.133.34:8888';
    ls.set(getSourceArgsKey(source), JSON.stringify({ 线路: ip, server: ip }));

    const section = {
      title: '线路',
      type: 'select',
      chars: ['https://v1.gyks.cf', ip],
      default: 'https://v1.gyks.cf',
      paramKey: '线路',
    };

    const [augmented] = augmentExploreServerSelectSections(source, [section]);
    expect(augmented?.chars?.[0]).toBe(ip);
    expect(augmented?.default).toBe(ip);
  });
});
