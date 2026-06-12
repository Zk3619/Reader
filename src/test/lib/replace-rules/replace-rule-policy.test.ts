import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  getReplaceEnableDefault,
  isReplaceRuleEnabledForBook,
  setReplaceEnableDefault,
} from '@/lib/replace-rules/replace-rule-policy';
import { BookType } from '@/lib/book-source/book-type';
import type { Book } from '@/types';

describe('replace-rule-policy', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
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

  it('defaults replace enable to true', () => {
    expect(getReplaceEnableDefault()).toBe(true);
  });

  it('respects global replace enable default', () => {
    setReplaceEnableDefault(false);
    const book = { type: BookType.text, origin: 'https://x.com', readConfig: {} } as Book;
    expect(isReplaceRuleEnabledForBook(book)).toBe(false);
  });

  it('disables replace for image books when unset', () => {
    const book = { type: BookType.image, origin: 'https://x.com', readConfig: {} } as Book;
    expect(isReplaceRuleEnabledForBook(book)).toBe(false);
  });

  it('honors explicit book useReplaceRule', () => {
    const book = {
      type: BookType.image,
      origin: 'https://x.com',
      readConfig: { useReplaceRule: true },
    } as Book;
    expect(isReplaceRuleEnabledForBook(book)).toBe(true);
  });
});
