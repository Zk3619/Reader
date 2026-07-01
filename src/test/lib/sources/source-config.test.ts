import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, value);
  },
  clear: () => storage.clear(),
});

import { getBookScore, setBookScore } from '@/lib/sources/source-config';

describe('source-config book score', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('scores change-source rows independently by bookUrl', () => {
    const shared = { origin: 'https://a.com', name: '书名', author: '作者' };
    setBookScore(shared.origin, shared.name, shared.author, 1, 'https://a.com/book-1');
    setBookScore(shared.origin, shared.name, shared.author, -1, 'https://a.com/book-2');

    expect(getBookScore(shared.origin, shared.name, shared.author, 'https://a.com/book-1')).toBe(1);
    expect(getBookScore(shared.origin, shared.name, shared.author, 'https://a.com/book-2')).toBe(-1);
    expect(getBookScore(shared.origin, shared.name, shared.author)).toBe(0);
  });

  it('keeps legacy score key when bookUrl is omitted', () => {
    setBookScore('https://b.com', '书名', '作者', 1);
    expect(getBookScore('https://b.com', '书名', '作者')).toBe(1);
  });
});
