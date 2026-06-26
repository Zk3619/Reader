import { describe, expect, it } from 'vitest';
import {
  computeChapterPosFromParagraph,
  computeFineChapterPos,
  emitReadAloudProgress,
  getReadAloudProgress,
} from '@/lib/media/text/read-aloud-progress';
import {
  buildAloudParagraphIndexMap,
  filterParagraphsForAloud,
  findParagraphIndexInFilteredList,
  getFilteredAloudParagraphs,
  shouldSkipReadAloudParagraph,
} from '@/lib/media/text/read-aloud-paragraphs';

describe('read-aloud-progress', () => {
  it('computes chapter position from paragraph index', () => {
    expect(computeChapterPosFromParagraph(0, 5)).toBe(0);
    expect(computeChapterPosFromParagraph(2, 5)).toBe(0.5);
    expect(computeChapterPosFromParagraph(4, 5)).toBe(1);
  });

  it('emits and reads progress', () => {
    emitReadAloudProgress({
      chapterIndex: 0,
      paragraphIndex: 1,
      paragraphCount: 3,
      paragraphText: '测试',
      chapterPos: 0.5,
    });
    expect(getReadAloudProgress()?.paragraphText).toBe('测试');
    emitReadAloudProgress(null);
    expect(getReadAloudProgress()).toBeNull();
  });

  it('computes fine chapter position within paragraph', () => {
    expect(computeFineChapterPos(0, 5, 0, 'abcdefghij')).toBe(0);
    expect(computeFineChapterPos(0, 5, 5, 'abcdefghij')).toBeCloseTo(0.125);
    expect(computeFineChapterPos(4, 5, 0, 'last')).toBe(1);
  });
});

describe('aloud paragraph block map', () => {
  it('maps display blocks to filtered paragraph indices', () => {
    const html = '<p>第一段。</p><p>。。。</p><p>第二段。</p>';
    const map = buildAloudParagraphIndexMap(html, [
      { blockIndex: 0, text: '第一段。' },
      { blockIndex: 1, text: '第二段。' },
    ]);
    expect(map.get(0)).toBe(0);
    expect(map.get(1)).toBe(1);
  });

  it('finds selection in filtered list', () => {
    const paragraphs = getFilteredAloudParagraphs('<p>甲</p><p>。。。</p><p>乙</p>');
    expect(findParagraphIndexInFilteredList(paragraphs, '乙')).toBe(1);
  });
});

describe('notReadAloudRegex', () => {
  it('skips punctuation-only paragraphs', () => {
    expect(shouldSkipReadAloudParagraph('。。。')).toBe(true);
    expect(shouldSkipReadAloudParagraph('正文')).toBe(false);
  });

  it('filters paragraph list', () => {
    expect(filterParagraphsForAloud(['。。。', '你好', '   '])).toEqual(['你好']);
  });
});
