import { describe, expect, it } from 'vitest';
import {
  absolutizeRssContentImageUrls,
  annotateRssLoadingPlaceholders,
  neutralizeRssLazyLoadDirectSrc,
  prepareRssContentImages,
} from '@/lib/rss-source/rss-content-images';
import { wrapRssHtmlForWebView } from '@/lib/rss-source/rss-html';
import { buildRssContentImageBridgeScript } from '@/lib/rss-source/rss-content-document';
import type { RssSource } from '@/types';

const baseUrl = 'https://www.hentaiclub.net/r18/67777.html';

describe('rss-content-images', () => {
  it('绝对化绅士会所 thumbnail 占位 src', () => {
    const html =
      '<li><img src="/static/thumbnail.gif" data-src="https://cdn.sshs.rip/a1/a2/img1.webp"></li>';
    const out = absolutizeRssContentImageUrls(html, baseUrl);
    expect(out).toContain('src="https://www.hentaiclub.net/static/thumbnail.gif"');
    expect(out).toContain('data-src="https://cdn.sshs.rip/a1/a2/img1.webp"');
  });

  it('为懒加载占位图写入 data-reader-ph', () => {
    const html =
      '<img src="/static/thumbnail.gif" data-src="https://cdn.sshs.rip/a1/a2/img1.webp">';
    const out = annotateRssLoadingPlaceholders(html, baseUrl);
    expect(out).toContain('data-reader-ph="https://www.hentaiclub.net/static/thumbnail.gif"');
  });

  it('改写懒加载脚本避免直连 CDN src', () => {
    const js =
      "item.src=item.getAttribute('data-src')";
    const out = neutralizeRssLazyLoadDirectSrc(js);
    expect(out).toContain('__READER_RSS_PATCH_IMG__');
    expect(out).toContain('n.target');
    expect(out).not.toMatch(/item\.src=item\.getAttribute\('data-src'\)/);
  });

  it('改写 IO 回调整块（item=item.target 无效时取 entry.target）', () => {
    const js = `entires.forEach(item => {
  if(item.isIntersecting){
    item=item.target
    item.src=item.getAttribute('data-src')
    lazy.unobserve(item)
  }
})`;
    const out = neutralizeRssLazyLoadDirectSrc(js);
    expect(out).not.toContain('item.src=item.getAttribute');
    expect(out).not.toContain('item=item.target');
    expect(out).toContain('__READER_RSS_PATCH_IMG__');
    expect(out).toContain('n.target');
    expect(out).toContain('lazy.unobserve(el)');
  });

  it('prepareRssContentImages 同时绝对化并标注占位', () => {
    const html =
      '<img src="/static/thumbnail.gif" data-src="https://cdn.sshs.rip/a1/a2/img1.webp">';
    const out = prepareRssContentImages(html, baseUrl);
    expect(out).toContain('https://www.hentaiclub.net/static/thumbnail.gif');
    expect(out).toContain('data-reader-ph=');
  });
});

describe('RSS 加载占位样式与图片桥', () => {
  it('wrapRssHtmlForWebView 注入占位图 CSS 覆盖 width:100%', () => {
    const source = {
      sourceName: '绅士会所',
      sourceUrl: 'https://www.hentaiclub.net/',
      style: 'img{width:100%;height:auto}',
    } as RssSource;
    const wrapped = wrapRssHtmlForWebView('<ul id="box"></ul>', source, source.style);
    expect(wrapped).toContain('thumbnail.gif');
    expect(wrapped).toContain('width:auto !important');
  });

  it('wrapRssHtmlForWebView 禁用 ul#box 内层滚动避免双滚动条', () => {
    const source = {
      sourceName: '绅士会所',
      sourceUrl: 'https://www.hentaiclub.net/',
      style: 'ul{font-size:0;height:100%;overflow-y:scroll}img{width:100%}',
    } as RssSource;
    const wrapped = wrapRssHtmlForWebView('<ul id="box"></ul>', source, source.style);
    expect(wrapped).toContain('ul#box');
    expect(wrapped).toContain('overflow-y:visible!important');
  });

  it('图片桥拦截 src 赋值并在失败时回退占位', () => {
    const script = buildRssContentImageBridgeScript();
    expect(script).toContain('data-reader-ph');
    expect(script).toContain('data-reader-img-loading');
    expect(script).toContain('data-src');
    expect(script).toContain('showPlaceholder');
    expect(script).toContain('installImgSrcHooks');
    expect(script).toContain('ensurePlaceholderBlob');
    expect(script).toContain('data-reader-err-bound');
    expect(script).toContain('data-reader-bypass');
    expect(script).toContain('__READER_RSS_PATCH_IMG__');
    expect(script).toContain('asImgNode');
  });
});
