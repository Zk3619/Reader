import { describe, expect, it } from 'vitest';
import {
  extractParagraphsFromHtml,
  extractParagraphsFromPageText,
  splitChapterParagraphs,
} from '@/lib/media/text/read-aloud-paragraphs';

describe('read-aloud-paragraphs', () => {
  it('extracts paragraphs from HTML blocks', () => {
    const html = '<p>第一段。</p><p>第二段。</p>';
    const paragraphs = extractParagraphsFromHtml(html);
    expect(paragraphs).toEqual(['第一段。', '第二段。']);
  });

  it('splits page text by sentence punctuation', () => {
    const parts = extractParagraphsFromPageText('你好。世界！');
    expect(parts.length).toBeGreaterThanOrEqual(1);
    expect(parts.join('')).toContain('你好');
  });

  it('computes start index from chapter position', () => {
    const html = '<p>A</p><p>B</p><p>C</p><p>D</p>';
    const result = splitChapterParagraphs(html, {
      anchor: { chapterPos: 0.5 },
    });
    expect(result.paragraphs.length).toBe(4);
    expect(result.startIndex).toBe(2);
  });

  it('readAloudByPage uses page text only', () => {
    const result = splitChapterParagraphs('<p>ignored</p>', {
      readAloudByPage: true,
      anchor: { pageText: '当前页内容。下一句。' },
    });
    expect(result.startIndex).toBe(0);
    expect(result.paragraphs.length).toBeGreaterThan(0);
  });
});
