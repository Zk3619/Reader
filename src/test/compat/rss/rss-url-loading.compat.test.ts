import { describe, expect, it } from 'vitest';
import { resolveRssLinkScheme, resolveRssLinkUrl } from '@/lib/rss-source/rss-url-loading';

describe('resolveRssLinkUrl', () => {
  it('相对路径基于 baseUrl 解析', () => {
    expect(resolveRssLinkUrl('/path/page.html', 'https://example.com/dir/')).toBe(
      'https://example.com/path/page.html',
    );
  });

  it('协议相对链接基于 baseUrl 解析', () => {
    expect(resolveRssLinkUrl('//cdn.example.com/a.js', 'https://example.com/')).toBe(
      'https://cdn.example.com/a.js',
    );
  });

  it('锚点与 javascript 返回 null', () => {
    expect(resolveRssLinkUrl('#top', 'https://example.com/')).toBeNull();
    expect(resolveRssLinkUrl('javascript:void(0)', 'https://example.com/')).toBeNull();
  });
});

describe('resolveRssLinkScheme', () => {
  it('http(s) 为 navigate', () => {
    expect(resolveRssLinkScheme('https://a.com', 'https://b.com/')).toEqual({
      type: 'navigate',
      url: 'https://a.com/',
    });
  });

  it('相对 http 链接解析后 navigate', () => {
    expect(resolveRssLinkScheme('/foo', 'https://example.com/bar/')).toEqual({
      type: 'navigate',
      url: 'https://example.com/foo',
    });
  });

  it('mailto 等非 http scheme 为 external', () => {
    expect(resolveRssLinkScheme('mailto:test@example.com')).toEqual({
      type: 'external',
      url: 'mailto:test@example.com',
    });
  });

  it('legado/yuedu 为 import', () => {
    expect(
      resolveRssLinkScheme('legado://import/auto?src=https%3A%2F%2Fa.com'),
    ).toEqual({
      type: 'import',
      url: 'legado://import/auto?src=https%3A%2F%2Fa.com',
    });
  });
});
