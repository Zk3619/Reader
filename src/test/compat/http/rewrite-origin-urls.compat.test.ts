import { describe, expect, it } from 'vitest';
import { rewriteHtmlAssetUrls } from '@/lib/http/rewrite-origin-urls';

describe('rewriteHtmlAssetUrls', () => {
  it('cdn-cgi 脚本保持书源绝对 URL，不经 Node 代理', () => {
    const html =
      '<html><head><script src="https://banzhu66666.net/cdn-cgi/challenge-platform/x.js"></script></head></html>';
    const out = rewriteHtmlAssetUrls(
      html,
      'https://banzhu66666.net/',
      '/__reader_http',
      'iw_test',
    );
    expect(out).toContain('src="https://banzhu66666.net/cdn-cgi/challenge-platform/x.js"');
    expect(out).not.toContain('__reader_http?target=');
  });

  it('CF 验证会话下同源 favicon 仍走代理（localhost 页无法跨域直连书源）', () => {
    const html = '<html><head><link rel="icon" href="/favicon.ico"></head></html>';
    const out = rewriteHtmlAssetUrls(
      html,
      'https://banzhu66666.net/',
      '/__reader_http',
      'iw_test',
    );
    expect(out).toContain('__reader_http?target=');
    expect(out).toContain(encodeURIComponent('https://banzhu66666.net/favicon.ico'));
  });
});
