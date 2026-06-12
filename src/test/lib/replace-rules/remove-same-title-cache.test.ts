import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearSameTitleRemovalCacheForBook,
  isSameTitleRemovalCached,
  markSameTitleRemovalCached,
} from '@/lib/replace-rules/remove-same-title-cache';

describe('remove-same-title-cache', () => {
  beforeEach(() => {
    clearSameTitleRemovalCacheForBook();
  });

  it('marks and checks chapter cache', () => {
    expect(isSameTitleRemovalCached('https://b', 3)).toBe(false);
    markSameTitleRemovalCached('https://b', 3);
    expect(isSameTitleRemovalCached('https://b', 3)).toBe(true);
    expect(isSameTitleRemovalCached('https://b', 4)).toBe(false);
  });

  it('clears per book', () => {
    markSameTitleRemovalCached('https://a', 0);
    markSameTitleRemovalCached('https://b', 0);
    clearSameTitleRemovalCacheForBook('https://a');
    expect(isSameTitleRemovalCached('https://a', 0)).toBe(false);
    expect(isSameTitleRemovalCached('https://b', 0)).toBe(true);
  });
});
