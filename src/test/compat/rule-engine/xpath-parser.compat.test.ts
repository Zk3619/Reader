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

});
