import { describe, expect, it } from 'vitest';
import {
  extractProxiedDocumentQuery,
  patchProxiedDocumentLocationQuery,
} from '@/lib/platform/inner-web-proxied-query';
import {
  injectInnerWebBaseTag,
  resolveInnerWebDocumentBaseUrl,
  shouldPreferInnerWebUrlOverHtml,
} from '@/lib/platform/inner-web-document-html';

describe('extractProxiedDocumentQuery', () => {
  it('extracts query from any https document URL', () => {
    expect(
      extractProxiedDocumentQuery(
        'https://example.com/app/page?foo=1&bar=2',
      ),
    ).toBe('foo=1&bar=2');
  });

  it('returns empty when document has no query', () => {
    expect(extractProxiedDocumentQuery('https://example.com/page')).toBe('');
  });
});

describe('patchProxiedDocumentLocationQuery', () => {
  const doc =
    'https://v1.gyks.cf/get_para_review?book_id=abc&item_id=123&para=4&source=%E7%95%AA%E8%8C%84';

  it('patches window.location.search for URLSearchParams', () => {
    const html = 'const urlParams = new URLSearchParams(window.location.search);';
    const out = patchProxiedDocumentLocationQuery(html, doc);
    expect(out).toContain('book_id=abc');
    expect(out).not.toContain('window.location.search');
  });

  it('patches location.search shorthand', () => {
    const html = 'const p = new URLSearchParams(location.search);';
    const out = patchProxiedDocumentLocationQuery(html, doc);
    expect(out).toContain('item_id=123');
    expect(out).not.toContain('location.search');
  });

  it('does not rewrite unrelated URLSearchParams literals', () => {
    const html = 'const other = new URLSearchParams("cursor=abc");';
    const out = patchProxiedDocumentLocationQuery(html, doc);
    expect(out).toBe(html);
  });

  it('leaves HTML unchanged when document URL has no query', () => {
    const html = 'const urlParams = new URLSearchParams(window.location.search);';
    const out = patchProxiedDocumentLocationQuery(
      html,
      'https://example.com/page',
    );
    expect(out).toBe(html);
  });

  it('works for non-paragraph-review URLs', () => {
    const html = 'const q = new URLSearchParams(window.location.search);';
    const out = patchProxiedDocumentLocationQuery(
      html,
      'https://example.com/oauth/callback?code=xyz&state=1',
    );
    expect(out).toContain('code=xyz');
    expect(out).not.toContain('window.location.search');
  });
});

describe('resolveInnerWebDocumentBaseUrl', () => {
  it('uses site root base for get_para_review', () => {
    expect(
      resolveInnerWebDocumentBaseUrl(
        'https://v1.gyks.cf/get_para_review?book_id=1&para=2',
      ),
    ).toBe('https://v1.gyks.cf/');
  });

  it('keeps full URL for generic https pages', () => {
    expect(resolveInnerWebDocumentBaseUrl('https://example.com/path/page?q=1')).toBe(
      'https://example.com/path/page?q=1',
    );
  });
});

describe('shouldPreferInnerWebUrlOverHtml', () => {
  it('prefers http url when html has no base', () => {
    expect(
      shouldPreferInnerWebUrlOverHtml(
        'https://v1.gyks.cf/get_para_review?book_id=1',
        '<html></html>',
      ),
    ).toBe(true);
  });

  it('uses srcdoc when html already has base', () => {
    expect(
      shouldPreferInnerWebUrlOverHtml(
        'https://v1.gyks.cf/get_para_review?book_id=1',
        '<html><head><base href="https://v1.gyks.cf/"></head></html>',
      ),
    ).toBe(false);
  });
});

describe('injectInnerWebBaseTag', () => {
  it('injects base href at start of head', () => {
    const out = injectInnerWebBaseTag(
      '<html><head><title>x</title></head><body></body></html>',
      'https://v1.gyks.cf/get_para_review?book_id=1',
    );
    expect(out).toContain('<base href="https://v1.gyks.cf/">');
  });
});
