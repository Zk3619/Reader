import { describe, expect, it } from 'vitest';
import {
  entryListSummary,
  formatSubscribeTime,
  sanitizeSubscribeHtml,
  stripSubscribeHtml,
} from '@/lib/subscribe/presentation';

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

  it('formats time', () => {
    const now = Date.now();
    expect(formatSubscribeTime(null)).toBe('');
    expect(formatSubscribeTime(now).length).toBeGreaterThan(0);
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
});
