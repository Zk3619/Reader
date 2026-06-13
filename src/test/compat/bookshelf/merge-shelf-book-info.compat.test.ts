import { describe, expect, it } from 'vitest';
import type { Book, SearchBook } from '@/types';
import {
  isMeaningfulBookField,
  mergeShelfBookFromSearchBook,
  shelfBookInfoMetadataChanged,
} from '@/lib/bookshelf/merge-shelf-book-info';

function shelfBook(overrides: Partial<Book> = {}): Book {
  const now = Date.now();
  return {
    bookUrl: 'https://example.com/book/1',
    tocUrl: 'https://example.com/book/1',
    origin: 'https://src.example.com',
    originName: '测试书源',
    name: '测试书名',
    author: '',
    intro: undefined,
    coverUrl: undefined,
    type: 0,
    group: 0,
    latestChapterTime: now,
    lastCheckTime: now,
    lastCheckCount: 0,
    totalChapterNum: 0,
    durChapterIndex: 0,
    durChapterPos: 0,
    durVolumeIndex: 0,
    chapterInVolumeIndex: 0,
    durChapterTime: now,
    canUpdate: true,
    order: 0,
    originOrder: 0,
    syncTime: 0,
    ...overrides,
  };
}

function searchBook(overrides: Partial<SearchBook> = {}): SearchBook {
  return {
    bookUrl: 'https://example.com/book/1',
    tocUrl: 'https://example.com/catalog/1',
    origin: 'https://src.example.com',
    originName: '测试书源',
    name: '测试书名',
    author: '张三',
    intro: '完整简介内容',
    coverUrl: 'https://example.com/cover.jpg',
    type: 0,
    time: 0,
    originOrder: 0,
    chapterWordCount: 0,
    respondTime: 0,
    ...overrides,
  };
}

describe('merge-shelf-book-info', () => {
  it('isMeaningfulBookField rejects placeholder punctuation', () => {
    expect(isMeaningfulBookField('')).toBe(false);
    expect(isMeaningfulBookField('—')).toBe(false);
    expect(isMeaningfulBookField(' • ')).toBe(false);
    expect(isMeaningfulBookField('张三')).toBe(true);
  });

  it('fills missing shelf author from detail without touching progress', () => {
    const existing = shelfBook({ author: '', durChapterIndex: 3, group: 4, latestChapterTime: 1000 });
    const detail = searchBook({
      author: '李四',
      latestChapterTitle: '第100话',
      latestChapterUpdateTime: '1704067200000',
    });
    const merged = mergeShelfBookFromSearchBook(existing, detail);

    expect(merged.author).toBe('李四');
    expect(merged.latestChapterTitle).toBe('第100话');
    expect(merged.latestChapterTime).toBe(1704067200000);
    expect(merged.intro).toBe('完整简介内容');
    expect(merged.coverUrl).toBe('https://example.com/cover.jpg');
    expect(merged.tocUrl).toBe('https://example.com/catalog/1');
    expect(merged.durChapterIndex).toBe(3);
    expect(merged.group).toBe(4);
    expect(shelfBookInfoMetadataChanged(existing, merged)).toBe(true);
  });

  it('keeps meaningful shelf author when detail is empty', () => {
    const existing = shelfBook({ author: '王五' });
    const detail = searchBook({
      author: '',
      intro: existing.intro,
      coverUrl: existing.coverUrl,
      tocUrl: existing.tocUrl,
      name: existing.name,
      kind: existing.kind,
      wordCount: existing.wordCount,
      latestChapterTitle: existing.latestChapterTitle,
      type: existing.type,
      variable: existing.variable,
    });
    const merged = mergeShelfBookFromSearchBook(existing, detail);

    expect(merged.author).toBe('王五');
  });

  it('prefers longer detail intro over short list intro', () => {
    const existing = shelfBook({ intro: '短简介' });
    const detail = searchBook({
      intro: '这是一段更完整的简介，包含更多书籍信息。',
    });
    const merged = mergeShelfBookFromSearchBook(existing, detail);

    expect(merged.intro).toBe('这是一段更完整的简介，包含更多书籍信息。');
  });
});
