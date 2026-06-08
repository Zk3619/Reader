import { describe, expect, it } from 'vitest';
import {
  chapterPosForChapterSwitch,
  chapterPosForPagedEntry,
  consumePagedChapterEntry,
  markPagedChapterEntry,
} from '@/lib/media/text/reader-paged-chapter-entry';

describe('reader-paged-chapter-entry', () => {
  it('maps first/last entry to chapterPos endpoints', () => {
    expect(chapterPosForPagedEntry('first', 0.5)).toBe(0);
    expect(chapterPosForPagedEntry('last', 0.5)).toBe(1);
    expect(chapterPosForPagedEntry('restore', 0.42)).toBe(0.42);
  });

  it('scroll mode maps first/last to chapter start', () => {
    expect(chapterPosForChapterSwitch('first', 0.5, true)).toBe(0);
    expect(chapterPosForChapterSwitch('last', 0.5, true)).toBe(0);
    expect(chapterPosForChapterSwitch('last', 0.5, false)).toBe(1);
  });

  it('consumes pending entry once', () => {
    markPagedChapterEntry('last');
    expect(consumePagedChapterEntry()).toBe('last');
    expect(consumePagedChapterEntry()).toBe('restore');
  });
});
