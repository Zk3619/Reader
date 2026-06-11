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

  it('li@figure@a.0 对每个 figure 取第一个 a', () => {
    const html = `<ul class="list-gallery">
      <li><figure>
        <a href="/one" title="1">1</a>
        <div><a href="/one-dup">dup</a></div>
      </figure></li>
      <li><figure>
        <a href="/two" title="2">2</a>
      </figure></li>
    </ul>`;
    const out = parseCss('li@figure@a.0', html);
    expect(out.length).toBe(2);
    expect(out[0]).toContain('href="/one"');
    expect(out[1]).toContain('href="/two"');
  });

  it('img@srcset 提取 srcset 属性而非嵌套标签', () => {
    const html = '<a href="/x"><img srcset="https://cdn.example/a.jpg 1x, https://cdn.example/b.jpg 2x"></a>';
    expect(parseCss('img@srcset', html)).toEqual([
      'https://cdn.example/a.jpg 1x, https://cdn.example/b.jpg 2x',
    ]);
  });

  it('未命中 .gray authorarticle 时不应泄漏 body@text', () => {
    const html = readFileSync(join(process.cwd(), 'tmp-gugu-detail.html'), 'utf8');
    const out = parseCss('.gray a[href*="authorarticle"]@text', html);
    expect(out).toEqual([]);
  });
});
