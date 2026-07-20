import { describe, expect, it } from 'vitest';
import { pd, pdfa, pdfh, pdfl } from '@/lib/media/tv/spider/tv-js-html-parser';

const HTML = `
<div class="list">
  <a class="item" href="/v/1.html" title="一"><span class="note">更新</span></a>
  <a class="item" href="/v/2.html" title="二"><span class="note">完结</span></a>
</div>
`;

describe('tv-js-html-parser', () => {
  it('pdfh extracts text and attrs', () => {
    expect(pdfh(HTML, '.item&&title')).toBe('一');
    expect(pdfh(HTML, '.item&&Text')).toContain('更新');
  });

  it('pdfa returns multiple nodes', () => {
    const arr = pdfa(HTML, '.item');
    expect(arr.length).toBe(2);
  });

  it('pd joins relative urls', () => {
    expect(pd(HTML, '.item&&href', 'https://ex.com')).toBe('https://ex.com/v/1.html');
  });

  it('pdfl builds title$url list', () => {
    const list = pdfl(HTML, '.item', 'a&&title', 'a&&href', 'https://ex.com');
    expect(list[0]).toMatch(/^一\$/);
  });
});
