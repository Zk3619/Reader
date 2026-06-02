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

  it('supports span[n] positional predicates via cheerio', () => {
    const item =
      '<p class="info"><span>《<a href="/2924/">书名一</a>》</span>' +
      '<span>作者：<a href="/author/x">作者名</a></span></p>';
    expect(parseXPath('//p[@class="info"]/span[1]/a/text()', item)[0]).toContain('书名一');
    expect(parseXPath('//p[@class="info"]/span[2]/a/text()', item)[0]).toContain('作者名');
    expect(parseXPath('//p[@class="info"]/span[1]/a/@href', item)[0]).toBe('/2924/');
  });

  it('div[@class][2] 为 1-based 同级谓词（section 下第 2 个 card）', () => {
    const html = `
<section>
  <div class="container"><div class="card mt20"></div></div>
  <div class="card mt20"><ul class="dirlist clearfix"><li><a href="/latest.html">最新</a></li></ul></div>
  <div class="card mt20"><ul class="dirlist clearfix"><li><a href="/2924/read_1.html">第一章</a></li></ul></div>
</section>`;
    const out = parseXPath(
      '//div[@class="card mt20"][2]//ul[@class="dirlist clearfix"]/li/a/@href',
      html,
    );
    expect(out[0]).toBe('/2924/read_1.html');
  });

  it('span[n] 仍为 1 起始位置谓词', () => {
    const item =
      '<p class="info"><span>《<a href="/2924/">书名</a>》</span>' +
      '<span>作者：<a href="/author/x">作者名</a></span></p>';
    expect(parseXPath('//p[@class="info"]/span[2]/a/text()', item)[0]).toContain('作者名');
    expect(parseXPath('//p[@class="info"]/span[1]/a/text()', item)[0]).toContain('书名');
  });

});
