/**
 * 导出书架书单 JSON（对齐 Legado BookshelfViewModel.exportBookshelf）
 */

import type { Book } from '@/types';
import { saveTextFile } from '@/lib/export/save-text-file';

export interface BookshelfExportEntry {
  name: string;
  author: string;
  intro?: string;
}

export function booksToExportEntries(books: Book[]): BookshelfExportEntry[] {
  return books.map((b) => ({
    name: b.name,
    author: b.author ?? '',
    intro: b.customIntro ?? b.intro,
  }));
}

export function serializeBookshelfExport(books: Book[]): string {
  return JSON.stringify(booksToExportEntries(books), null, 2);
}

export async function exportBookshelfJson(
  books: Book[],
  fileName = 'bookshelf.json',
): Promise<void> {
  if (books.length === 0) {
    throw new Error('没有可导出的书籍');
  }
  await saveTextFile(fileName, serializeBookshelfExport(books), { moduleKey: 'reading' });
}
