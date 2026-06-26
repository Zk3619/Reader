import { describe, expect, it } from 'vitest';
import {
  chapterCharToPageSpanStart,
  clearPageAloudSpan,
  computePagedAloudHighlightRects,
  upPageAloudSpan,
} from '@/lib/media/text/read-aloud-paged-span';
import type { ReaderTextLine } from '@/lib/media/text/reader-text-layout-entities';

function line(text: string, top: number, paragraphEnd = false): ReaderTextLine {
  const h = 20;
  return {
    lineTop: top,
    lineBase: top + 16,
    lineBottom: top + h,
    text,
    chapterPosition: 0,
    column: 0,
    isParagraphEnd: paragraphEnd,
  };
}

describe('read-aloud-paged-span', () => {
  it('highlights paragraph from span start', () => {
    const lines = [
      line('第一段前半', 0),
      line('第一段后半', 20, true),
      line('第二段', 40, true),
    ];
    const out = upPageAloudSpan(lines, 3);
    expect(out[0]?.isReadAloud).toBe(true);
    expect(out[1]?.isReadAloud).toBe(true);
    expect(out[2]?.isReadAloud).toBeFalsy();
  });

  it('clears previous highlight', () => {
    const marked = upPageAloudSpan([line('a', 0, true)], 0);
    const cleared = clearPageAloudSpan(marked);
    expect(cleared[0]?.isReadAloud).toBe(false);
  });

  it('maps chapter char to page span', () => {
    expect(chapterCharToPageSpanStart(100, 150)).toBe(50);
    expect(chapterCharToPageSpanStart(100, 80)).toBe(0);
  });

  it('computes paragraph and read rects', () => {
    const lines = [
      {
        ...line('你好世界', 0, true),
        chapterPosition: 10,
        columns: [
          { startX: 0, endX: 10, char: '你', chapterPosition: 10 },
          { startX: 10, endX: 20, char: '好', chapterPosition: 11 },
        ],
      },
    ];
    const { paragraphRects, readRects } = computePagedAloudHighlightRects(
      lines,
      10,
      14,
      12,
      0,
    );
    expect(paragraphRects).toHaveLength(1);
    expect(readRects.length).toBeGreaterThan(0);
  });
});
