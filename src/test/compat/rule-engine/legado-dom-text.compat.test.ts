import { describe, expect, it } from 'vitest';
import * as cheerio from 'cheerio';
import { collectElementTextSegments } from '@/lib/rule-engine/legado-dom-text';
import { parseXPath } from '@/lib/rule-engine/xpath-parser';
import { analyzeString } from '@/lib/rule-engine/analyze-rule';

const BOOK_6963 = `
<div class="c_row cf">
  <a class="db cf" href="https://bachashuku.org/book/6963.html">
  <div class="row_text">
  <h4>老婆的性感开发之旅</h4>
  <p class="gray">8083979（我不是大神） | #NTR #绿帽 #调教 #人妻
  <br>    2004年，我以优异的成绩考入我省一所重点大学，和我一起入学的还有我相恋..</p>
  </div>
  </a>
</div>`;

describe('legado-dom-text segments', () => {
  it('splits p.gray by br into author line and intro', () => {
    const $ = cheerio.load(BOOK_6963);
    const segments = collectElementTextSegments($('p.gray').first());
    expect(segments[0]).toContain('8083979（我不是大神）');
    expect(segments[0]).toContain('#NTR');
    expect(segments[1]).toMatch(/^2004年/);
  });

  it('text()[2] returns intro segment not tag line tail', () => {
    const intro = parseXPath("//p[@class='gray']/text()[2]", BOOK_6963);
    expect(intro[0]).toMatch(/^2004年/);
    expect(intro[0]).not.toMatch(/NTR/);
  });

  it('text()[1] returns full first segment for book source replace rules', () => {
    const line = parseXPath("//p[@class='gray']/text()[1]", BOOK_6963);
    expect(line[0]).toContain('8083979（我不是大神）');
    expect(line[0]).toContain('|');
    expect(line[0]).toContain('#NTR');
  });
});

describe('book 6963 search rules', () => {
  const context = {
    content: BOOK_6963,
    contentType: 'html' as const,
    baseUrl: 'https://bachashuku.org/',
    result: BOOK_6963,
  };

  it('kind template yields tags after pipe', async () => {
    const kind = await analyzeString(
      "{{//p[@class='gray']/text()[1]##\\s##,}}\n##.*\\|<js>result</js>##\\#",
      context,
    );
    expect(kind.length).toBeGreaterThan(0);
    expect(kind).toMatch(/NTR|绿帽/);
    expect(kind).not.toMatch(/8083979/);
  });

  it('intro xpath returns prose after br', async () => {
    const intro = await analyzeString("//p[@class='gray']/text()[2]##\\s{2,}##", context);
    expect(intro).toMatch(/^2004年/);
    expect(intro).not.toMatch(/大神\)/);
  });
});
