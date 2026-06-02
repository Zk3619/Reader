import { describe, expect, it } from 'vitest';
import { parseXPath } from '@/lib/rule-engine/xpath-parser';

describe('xpath parser legado compatibility', () => {
  it('parses td fragment ending with </td> like legado wrapper', () => {
    const html = '<td><a href="/book/1">书名</a></td>';
    const out = parseXPath('//a/@href', html);
    expect(out[0]).toBe('/book/1');
  });

  it('keeps xml xpath support', () => {
    const xml = '<?xml version="1.0"?><root><item>hello</item></root>';
    const out = parseXPath('//item/text()', xml);
    expect(out[0]).toBe('hello');
  });

  it('degrades gracefully on dirty html payload', () => {
    const dirtyHtml =
      '<ul class="librarylist"><li><p class="info"><span><a href="/book_1/">圣墟</a></span></p></li></ul>' +
      '\u0000\u0007\ufffd\ufffd';
    const out = parseXPath('//ul[@class="librarylist"]/li//text()@all', dirtyHtml);
    expect(out.some((x) => x.includes('圣墟'))).toBe(true);
  });

});
