import { describe, expect, it } from 'vitest';
import {
  readLegadoAjaxCache,
  shouldCacheLegadoAjaxBody,
  writeLegadoAjaxCache,
} from '@/lib/js-engine/legado/host/ajax-coordinator';

describe('legado ajax cache helpers', () => {
  it('does not cache empty ajax failure bodies', () => {
    const cache = new Map<string, string>();
    expect(shouldCacheLegadoAjaxBody('')).toBe(false);
    writeLegadoAjaxCache(cache, 'https://example.com/discovestyle', '');
    expect(cache.size).toBe(0);
  });

  it('treats stale empty cache entries as cache miss for retry', () => {
    const cache = new Map<string, string>([['https://example.com/discovestyle', '']]);
    expect(readLegadoAjaxCache(cache, 'https://example.com/discovestyle')).toBeUndefined();
    expect(cache.has('https://example.com/discovestyle')).toBe(false);
  });

  it('caches successful ajax bodies', () => {
    const cache = new Map<string, string>();
    const body = JSON.stringify({ data: [{ title: 'x' }] });
    writeLegadoAjaxCache(cache, 'https://example.com/discovestyle', body);
    expect(readLegadoAjaxCache(cache, 'https://example.com/discovestyle')).toBe(body);
  });
});
