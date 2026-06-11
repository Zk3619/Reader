import { describe, expect, it } from 'vitest';
import {
  extractDetailGalleryImageUrls,
  supplementEmptyRssGallery,
} from '@/lib/rss-source/rss-detail-gallery-fallback';

describe('rss-detail-gallery-fallback', () => {
  it('从 data-src 提取 wp-content 组图', () => {
    const html = `<div class="brxpgv-gallery">
      <img src="data:image/gif;base64,x" data-src="https://hksexdoll.com/wp-content/uploads/2026/05/a.webp" />
      <img src="https://hksexdoll.com/placeholder.gif" data-src="https://hksexdoll.com/wp-content/uploads/2026/05/b.webp" />
    </div>`;
    expect(extractDetailGalleryImageUrls(html)).toEqual([
      'https://hksexdoll.com/wp-content/uploads/2026/05/a.webp',
      'https://hksexdoll.com/wp-content/uploads/2026/05/b.webp',
    ]);
  });

  it('向空 img-wrap 模板注入图片', () => {
    const ruleHtml =
      "<!DOCTYPE html><body><div class='img-wrap'></div><p>EXHIBITION ONLY</p></body>";
    const page = `<img data-src="https://cdn.example/1.webp" />`;
    const { html, supplemented, imageCount } = supplementEmptyRssGallery(ruleHtml, page);
    expect(supplemented).toBe(true);
    expect(imageCount).toBe(1);
    expect(html).toContain("src='https://cdn.example/1.webp'");
  });
});
