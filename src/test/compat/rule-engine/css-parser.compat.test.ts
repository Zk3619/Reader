import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCss } from '@/lib/rule-engine/css-parser';

describe('css parser legado compatibility', () => {
  it('tag!0 excludes a single index (Legado li!0 header skip)', () => {
    const html = `<ul><li>header</li><li>book</li></ul>`;
    expect(parseCss('tag.ul@tag.li!0@text', html)).toEqual(['book']);
  });

  it('returns merged outerHtml for @html and removes script/style', () => {
    const html = `
      <div class="item"><span>A</span><script>alert(1)</script></div>
      <div class="item"><style>.x{}</style><span>B</span></div>
    `;
    const out = parseCss('.item@html', html);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('<div class="item"><span>A</span></div>');
    expect(out[0]).toContain('<div class="item"><span>B</span></div>');
    expect(out[0]).not.toContain('<script');
    expect(out[0]).not.toContain('<style');
  });

  it('未命中 .gray authorarticle 时不应泄漏 body@text', () => {
    const html = readFileSync(join(process.cwd(), 'tmp-gugu-detail.html'), 'utf8');
    const out = parseCss('.gray a[href*="authorarticle"]@text', html);
    expect(out).toEqual([]);
  });
});
