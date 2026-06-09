import { describe, expect, it } from 'vitest';
import { bookmarkNoteForDisplay } from '@/lib/media/text/reader-bookmark';

describe('bookmarkNoteForDisplay', () => {
  it('hides note when identical to bookText', () => {
    expect(
      bookmarkNoteForDisplay({
        bookText: '同一段原文',
        content: '同一段原文',
      }),
    ).toBe('');
  });

  it('shows note when different from bookText', () => {
    expect(
      bookmarkNoteForDisplay({
        bookText: '原文',
        content: '我的笔记',
      }),
    ).toBe('我的笔记');
  });

  it('hides empty note', () => {
    expect(
      bookmarkNoteForDisplay({
        bookText: '原文',
        content: '  ',
      }),
    ).toBe('');
  });
});
