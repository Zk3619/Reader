import * as cheerio from 'cheerio';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyzeListElements } from '@/lib/rule-engine';
import {
  parseLegadoXPathSegment,
  queryLegadoXPathElements,
  xpathQueryHasLegadoNumericIndex,
} from '@/lib/rule-engine/xpath-parser';

/** 对齐圣墟详情页：信息卡在 container 内，最新/完整目录为 section 下同级 card */
const SHENGXU_TOC_SECTION_HTML = `
<section>
  <div class="container">
    <div class="card mt20"><p>书籍信息</p></div>
  </div>
  <div class="card mt20">
    <h2>最新章节列表</h2>
    <ul class="dirlist clearfix"><li><a href="/999.html">最新章</a></li></ul>
  </div>
  <div class="card mt20">
    <h2>章节目录</h2>
    <ul class="dirlist clearfix">
      <li><a href="/1.html">第一章</a></li>
      <li><a href="/2.html">第二章</a></li>
    </ul>
  </div>
</section>`;

function elementsOuterHtml(html: string, elements: cheerio.Cheerio<any>): string {
  const $ = cheerio.load(html);
  const parts: string[] = [];
  elements.each((_, el) => {
    const outer = $.html(el);
    if (outer?.trim()) parts.push(outer);
  });
  return parts.join('\n');
}

describe('Legado/JsoupXpath 数字谓词 1 起始', () => {
  const ctx = {
    content: SHENGXU_TOC_SECTION_HTML,
    contentType: 'html' as const,
    baseUrl: 'http://www.shengxuxu.net/book_1/',
    result: SHENGXU_TOC_SECTION_HTML,
  };

  const legadoRule =
    '//div[@class="card mt20"][2]//ul[@class="dirlist clearfix"]/li';

  it('parseLegadoXPathSegment 将 [2] 记为 1-based 位置 2', () => {
    const seg = parseLegadoXPathSegment('div[@class="card mt20"][2]');
    expect(seg?.position).toBe(2);
  });

  it('span[1] 与其它 [n] 共用同一套 1-based 谓词', () => {
    expect(parseLegadoXPathSegment('span[1]')?.position).toBe(1);
    expect(xpathQueryHasLegadoNumericIndex('//p[@class="info"]/span[1]/a/text()')).toBe(true);
  });

  it('[2] 命中 section 下第 2 个 card mt20（完整目录）', () => {
    const items = queryLegadoXPathElements(SHENGXU_TOC_SECTION_HTML, legadoRule);
    const blob = elementsOuterHtml(SHENGXU_TOC_SECTION_HTML, items);
    expect(items.length).toBe(2);
    expect(blob).toContain('第一章');
    expect(blob).not.toContain('最新章');
  });

  it('analyzeListElements 与书源 XPath 一致', async () => {
    expect(xpathQueryHasLegadoNumericIndex(legadoRule)).toBe(true);
    const items = await analyzeListElements(`${legadoRule}@all`, ctx);
    const blob = items.map((i) => i.content).join('\n');
    expect(items.length).toBe(2);
    expect(blob).toContain('第一章');
    expect(blob).not.toContain('最新章');
  });

  it('[1] 命中 section 下第 1 个 card mt20（最新章节区）', () => {
    const items = queryLegadoXPathElements(
      SHENGXU_TOC_SECTION_HTML,
      '//div[@class="card mt20"][1]//ul[@class="dirlist clearfix"]/li',
    );
    expect(items.length).toBe(1);
    const blob = elementsOuterHtml(SHENGXU_TOC_SECTION_HTML, items);
    expect(blob).toContain('最新章');
    expect(blob).not.toContain('第一章');
  });

  it('真实书页 fixture：[2] 命中完整章节目录块', () => {
    const fixture = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../fixtures/shengxuxu-book-2924.html',
    );
    const html = readFileSync(fixture, 'utf8');
    const items = queryLegadoXPathElements(html, legadoRule);
    const blob = elementsOuterHtml(html, items);
    expect(items.length).toBeGreaterThan(10);
    expect(blob).toContain('第一章');
    expect(blob).not.toMatch(/read_24\.html.*read_23\.html/s);
  });
});
