import { describe, expect, it, vi } from 'vitest';
import {
  entryListSummary,
  formatSubscribeTime,
  rewriteSubscribeImageUrl,
  sanitizeSubscribeHtml,
  stripSubscribeHtml,
  resolveSubscribeSourceIconCandidates,
} from '@/lib/subscribe/presentation';

vi.mock('@/lib/platform/detect', () => ({
  isTauri: () => false,
}));

describe('subscribe presentation', () => {
  it('strips html to plain text', () => {
    expect(stripSubscribeHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
  });

  it('sanitizes dangerous html', () => {
    const html = sanitizeSubscribeHtml(
      '<p onclick="alert(1)">Hi</p><script>evil()</script><a href="javascript:alert(1)">x</a><a href="https://ok.example">ok</a>',
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');
    expect(html).toContain('https://ok.example');
    expect(html).toContain('target="_blank"');
  });

  it('resolves relative images with baseUrl', () => {
    const html = sanitizeSubscribeHtml('<p><img src="/pic.jpg"></p>', {
      baseUrl: 'https://news.example.com/posts/1',
    });
    expect(html).toContain('src="https://news.example.com/pic.jpg"');
    expect(html).toContain('data-subscribe-origin-src="https://news.example.com/pic.jpg"');
    expect(html).toContain('referrerpolicy="no-referrer"');
  });

  it('rewrites hotlink images through folo proxy', () => {
    const url = rewriteSubscribeImageUrl('https://wx1.sinaimg.cn/large/abc.jpg');
    expect(url.startsWith('https://img.folo.is?url=')).toBe(true);
    expect(url).toContain(encodeURIComponent('https://wx1.sinaimg.cn/large/abc.jpg'));
  });

  it('formats time with minutes', () => {
    const now = Date.now();
    expect(formatSubscribeTime(null)).toBe('');
    expect(formatSubscribeTime(now).length).toBeGreaterThan(0);
    const earlier = new Date('2024-01-15T14:30:00').getTime();
    const formatted = formatSubscribeTime(earlier);
    expect(formatted).toMatch(/14:30|2:30/);
  });

  it('prefers meta description for list summary', () => {
    expect(
      entryListSummary({
        content: '<p>Long body content that should not win</p>',
        metaJson: JSON.stringify({ description: '<p>Short blurb</p>' }),
      }),
    ).toBe('Short blurb');
  });

  it('falls back to content when description missing', () => {
    expect(
      entryListSummary({
        content: '<p>Only body</p>',
        metaJson: '{}',
      }),
    ).toBe('Only body');
  });

  it('resolves source icon candidates from meta and host', () => {
    const list = resolveSubscribeSourceIconCandidates({
      url: 'https://example.com/feed.xml',
      metaJson: JSON.stringify({
        iconUrl: 'https://cdn.example.com/icon.png',
        siteUrl: 'https://example.com',
      }),
    });
    expect(list[0]).toBe('https://cdn.example.com/icon.png');
    expect(list.some((u) => u.includes('icons.folo.is'))).toBe(true);
  });
});
