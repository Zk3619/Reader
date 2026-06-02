import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { BookSource } from '@/types';
import { resolveSearchRequest } from '@/lib/book-source/analyze-search-url';
import { setCfActiveRequestOrigin } from '@/lib/book-source/source-http';

const SOURCE = {
  bookSourceUrl: 'https://banzhu66666.net/',
  sourceUrl: 'https://banzhu66666.net/',
  bookSourceName: 'banzhu',
  bookSourceType: 0,
  loginUrl: '',
  searchUrl:
    'https://banzhu66666.net/s.php,{"body":"objectType=2&s={{key}}","charset":"gbk","method":"POST"}',
  ruleSearch: { bookList: '.column-2', name: 'a.0@text', bookUrl: 'a.0@href' },
} as unknown as BookSource;

describe('search CF active origin', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolveSearchRequest 将搜索 URL 改写到 CF 镜像域', async () => {
    setCfActiveRequestOrigin(SOURCE, 'https://www.banzhu77777777.net/');
    const req = await resolveSearchRequest(SOURCE, 'test', 1);
    expect(req.url).toBe('https://www.banzhu77777777.net/s.php');
    expect(req.method).toBe('POST');
    expect(req.charset).toBe('gbk');
    expect(req.headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded; charset=gbk',
    );
    expect(req.body).toContain('objectType=2');
    expect(req.body).toContain('s=test');
  });
});
