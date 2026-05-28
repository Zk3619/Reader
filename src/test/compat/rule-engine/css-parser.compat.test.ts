import { describe, expect, it } from 'vitest';
import { parseCss } from '@/lib/rule-engine/css-parser';

describe('css parser legado compatibility', () => {
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
});
