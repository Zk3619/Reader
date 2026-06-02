import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { BookSource } from '@/types';
import {
  alignUrlToBookSourceRequestOrigin,
  getCfActiveRequestOrigin,
  resolveBookSourceRequestOrigin,
  setCfActiveRequestOrigin,
} from '@/lib/book-source/source-http';

const SOURCE = {
  bookSourceUrl: 'https://banzhu66666.net/',
  sourceUrl: 'https://banzhu66666.net/',
  bookSourceName: 'banzhu',
  bookSourceType: 0,
  loginUrl: '',
} as unknown as BookSource;

describe('CF active request origin', () => {
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

  it('过 CF 后将对 banzhu66666 的发现 URL 改写到镜像域', () => {
    setCfActiveRequestOrigin(SOURCE, 'https://www.banzhu77777777.net/');
    expect(getCfActiveRequestOrigin(SOURCE)).toBe('https://www.banzhu77777777.net');
    const aligned = alignUrlToBookSourceRequestOrigin(
      'https://banzhu66666.net/shuku/0-lastupdate-0-1.html',
      SOURCE,
    );
    expect(aligned).toBe('https://www.banzhu77777777.net/shuku/0-lastupdate-0-1.html');
  });

  it('无 CF 记录时保持书源目录域', () => {
    expect(resolveBookSourceRequestOrigin(SOURCE)).toBe('https://banzhu66666.net');
    const url = 'https://banzhu66666.net/shuku/1.html';
    expect(alignUrlToBookSourceRequestOrigin(url, SOURCE)).toBe(url);
  });
});
