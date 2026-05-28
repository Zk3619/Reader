import { describe, expect, it } from 'vitest';
import { analyzeRule, analyzeString } from '@/lib/rule-engine';
import { normalizeSearchDisplayFields } from '@/lib/book-source/search';

const BACHA_ROW = `
<div class="c_row cf">
  <a class="db cf" href="https://bachashuku.org/book/6963.html">
  <div class="row_cover">
  <img class="cover_m" src="https://image.8xsk.org/6/6963/6963s.jpg">
  </div>
  <div class="row_text">
  <h4><span class="hot">老婆</span>的性感开发之旅</h4>
  <p class="gray">8083979（我不是大神） | #NTR #绿帽 #调教 #人妻
  <br>    2004年，我以优异的成绩考入了我省一所重点大学，和我一起入学的还有我相恋..</p>
  </div>
  </a>
</div>`;

describe('八叉 p.gray with br', () => {
  const context = {
    content: BACHA_ROW,
    contentType: 'html' as const,
    baseUrl: 'https://bachashuku.org/modules/article/search.php',
    source: {} as Record<string, unknown>,
    result: BACHA_ROW,
  };

  it('parses author intro kind from search rules', async () => {
    const author = await analyzeString('tag.p@text##(\\|.*)$', context);
    const intro = await analyzeString("//p[@class='gray']/text()[2]##\\s{2,}##", context);
    const kind = await analyzeString(
      "{{//p[@class='gray']/text()[1]##\\s##,}}\n##.*\\|<js>result</js>##\\#",
      context,
    );
    expect(author.trim()).toBe('8083979（我不是大神）');
    expect(author).not.toContain('NTR');
    expect(intro).toContain('2004年');
    expect(intro).not.toContain('大神');
    expect(kind).toContain('NTR');
    expect(kind).not.toContain('8083979');
  });

  it('normalizeSearchDisplayFields does not corrupt br-separated gray', async () => {
    const author = await analyzeString('tag.p@text##(\\|.*)$', context);
    const intro = await analyzeString("//p[@class='gray']/text()[2]##\\s{2,}##", context);
    const kind = await analyzeString(
      "{{//p[@class='gray']/text()[1]##\\s##,}}\n##.*\\|<js>result</js>##\\#",
      context,
    );
    const out = await normalizeSearchDisplayFields(context, {
      author,
      intro,
      kind,
      coverUrl: 'https://image.8xsk.org/6/6963/6963s.jpg',
      latestChapterTitle: '',
    });
    expect(out.author).toBe('8083979（我不是大神）');
    expect(out.intro).toContain('2004年');
    expect(out.kind).toMatch(/NTR|绿帽/);
    expect(out.kind).not.toMatch(/8083979/);
  });

  it('splits gray line without br via newline in single text node', async () => {
    const html = `<p class="gray">8083979（我不是大神） | #NTR #绿帽
    2004年，我以优异的成绩考入</p>`;
    const ctx = {
      content: html,
      contentType: 'html' as const,
      baseUrl: 'https://bachashuku.org/',
      result: html,
    };
    const intro = await analyzeString("//p[@class='gray']/text()[2]##\\s{2,}##", ctx);
    expect(intro).toContain('2004年');
    expect(intro).not.toMatch(/大神\)/);
  });
});
