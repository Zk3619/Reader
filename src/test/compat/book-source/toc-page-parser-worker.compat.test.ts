import { describe, expect, it } from 'vitest';
import { canParseTocPageOffMainThread } from '@/lib/book-source/toc-page-parser';
import type { TocRule } from '@/types';

describe('toc page parser worker capability', () => {
  it('accepts pure CSS/XPath chapter rules', () => {
    expect(canParseTocPageOffMainThread({
      chapterList: 'dl@dd',
      chapterName: 'a@text',
      chapterUrl: 'a@href',
      isVip: 'span.vip@text',
    } as TocRule)).toBe(true);
  });

  it('keeps host-dependent JS rules on the compatibility path', () => {
    expect(canParseTocPageOffMainThread({
      chapterList: '<js>java.ajax(baseUrl)</js>class.list@li',
      chapterName: 'a@text',
      chapterUrl: 'a@href',
    } as TocRule)).toBe(false);
  });

  it('accepts pure QuickJS rules for worker execution', () => {
    expect(canParseTocPageOffMainThread({
      chapterList: '<js>result</js>class.list@li',
      chapterName: 'a@text',
      chapterUrl: 'a@href',
      preUpdateJs: 'result.replace("旧", "新")',
    } as TocRule)).toBe(true);
  });
});
