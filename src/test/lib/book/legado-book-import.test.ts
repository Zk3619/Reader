import { describe, expect, it } from 'vitest';
import {
  mergeLegadoImportedBookFields,
  parseLegadoBookImportRow,
} from '@/lib/book/legado-book-import';
import type { Book } from '@/types';

describe('legado-book-import', () => {
  it('parses readConfig.pageAnim from object', () => {
    const row = parseLegadoBookImportRow({
      bookUrl: 'https://example.com/book/1',
      name: '测试书',
      readConfig: { pageAnim: 2, readSimulating: true, startChapter: 5 },
    });
    expect(row?.readConfig?.pageAnim).toBe(2);
    expect(row?.readConfig?.readSimulating).toBe(true);
    expect(row?.readConfig?.startChapter).toBe(5);
  });

  it('parses readConfig from JSON string', () => {
    const row = parseLegadoBookImportRow({
      bookUrl: 'https://example.com/book/2',
      name: '测试书二',
      readConfig: '{"pageAnim":-1,"useReplaceRule":false}',
    });
    expect(row?.readConfig?.pageAnim).toBe(-1);
    expect(row?.readConfig?.useReplaceRule).toBe(false);
  });

  it('merges imported readConfig onto book', () => {
    const base = { bookUrl: 'u', name: 'n', readConfig: { pageAnim: 0 } } as Book;
    const imported = parseLegadoBookImportRow({
      bookUrl: 'u',
      name: 'n',
      readConfig: { pageAnim: 3 },
      durChapterIndex: 12,
    })!;
    const merged = mergeLegadoImportedBookFields(base, imported);
    expect(merged.readConfig?.pageAnim).toBe(3);
    expect(merged.durChapterIndex).toBe(12);
  });
});
