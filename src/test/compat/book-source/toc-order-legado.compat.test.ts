import { describe, expect, it } from 'vitest';
import {
  finalizeTocChapterOrder,
  parseTocChapterListRule,
} from '@/lib/book-source/chapters';
import type { BookChapter } from '@/types';

function ch(url: string, title: string): BookChapter {
  return {
    url,
    title,
    isVolume: false,
    baseUrl: 'https://example.com/toc_1.html',
    bookUrl: 'https://example.com/book.html',
    index: 0,
    isVip: false,
    isPay: false,
  };
}

describe('目录正倒序 Legado 对齐', () => {
  it('parseTocChapterListRule 解析 - 与 + 前缀', () => {
    expect(parseTocChapterListRule('-dl dd')).toEqual({ listRule: 'dl dd', reverse: true });
    expect(parseTocChapterListRule('+dl dd')).toEqual({ listRule: 'dl dd', reverse: false });
    expect(parseTocChapterListRule('dl dd,dt')).toEqual({ listRule: 'dl dd,dt', reverse: false });
  });

  it('默认 reverseToc=false 时两次 reverse 保持分页拼接顺序', () => {
    const input = [ch('/1', 'p1a'), ch('/2', 'p1b'), ch('/3', 'p2a')];
    const out = finalizeTocChapterOrder(input, false, false);
    expect(out.map((c) => c.url)).toEqual(['/1', '/2', '/3']);
    expect(out[0].index).toBe(0);
    expect(out[2].index).toBe(2);
  });

  it('reverseToc=true 时仅一次 reverse（listRule 无 - 前缀）', () => {
    const input = [ch('/1', 'a'), ch('/2', 'b'), ch('/3', 'c')];
    const out = finalizeTocChapterOrder(input, false, true);
    expect(out.map((c) => c.url)).toEqual(['/3', '/2', '/1']);
  });

  it('listRule 带 - 前缀且 reverseToc=false 时最终倒序', () => {
    const input = [ch('/1', 'a'), ch('/2', 'b')];
    const out = finalizeTocChapterOrder(input, true, false);
    expect(out.map((c) => c.url)).toEqual(['/2', '/1']);
  });

  it('按 url 去重（先 reverse 再去重，与 Legado LinkedHashSet 一致）', () => {
    const input = [ch('/1', 'a'), ch('/2', 'b'), ch('/1', 'dup')];
    const out = finalizeTocChapterOrder(input, false, false);
    expect(out.map((c) => c.url)).toEqual(['/2', '/1']);
    expect(out[1].title).toBe('dup');
  });
});
