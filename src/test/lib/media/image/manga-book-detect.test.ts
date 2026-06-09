import { describe, expect, it } from 'vitest';
import {
  isMangaBookByMeta,
  isMangaChapterContent,
} from '@/lib/media/image/image-book-detect';
import { BookType } from '@/lib/book-source/book-type';

describe('manga-book-detect', () => {
  it('detects image-heavy chapter HTML', () => {
    const html = '<img src="https://cdn/a.jpg"/><img src="https://cdn/b.jpg"/>';
    expect(isMangaChapterContent(html)).toBe(true);
  });

  it('rejects text-heavy chapter', () => {
    const html = `<p>${'正文'.repeat(120)}</p><img src="https://cdn/a.jpg"/>`;
    expect(isMangaChapterContent(html)).toBe(false);
  });

  it('uses sourceType when book type is text', () => {
    const book = {
      type: BookType.text,
      origin: 'https://src',
      bookUrl: 'https://book/1',
      tocUrl: 'https://book/1',
    };
    expect(isMangaBookByMeta(book, { sourceType: 2 })).toBe(true);
  });
});
