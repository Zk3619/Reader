/**
 * 导入书架书单 JSON（对齐 Legado importBookshelfByJson）
 */

import { get } from '@/lib/http';
import * as booksDb from '@/lib/database/books';
import * as sourcesDb from '@/lib/database/sources';
import { preciseSearchBook, searchBook } from '@/lib/book-source/search';
import { addSearchBookToShelf } from '@/lib/bookshelf/save-book-to-shelf';
import type { BookshelfExportEntry } from '@/lib/bookshelf/export-bookshelf';
import type { SearchBook } from '@/types';

export interface ImportBookshelfResult {
  total: number;
  added: number;
  skipped: number;
  failed: number;
  errors: string[];
}

function parseBookshelfJson(text: string): BookshelfExportEntry[] {
  const trimmed = text.trim();
  const data = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(data)) {
    throw new Error('书单格式应为 JSON 数组');
  }
  return data.map((item) => {
    const row = item as Record<string, unknown>;
    const name = String(row.name ?? row.title ?? '').trim();
    const author = String(row.author ?? '').trim();
    const intro = row.intro != null ? String(row.intro) : undefined;
    return { name, author, intro };
  });
}

function isAbsUrl(text: string): boolean {
  return /^https?:\/\//i.test(text);
}

export async function loadBookshelfImportText(str: string): Promise<string> {
  const text = str.trim();
  if (isAbsUrl(text)) {
    return get(text, { timeout: 30000 });
  }
  return text;
}

async function preciseSearchOne(
  name: string,
  author: string,
): Promise<SearchBook | null> {
  const sources = await sourcesDb.getEnabledSources();
  for (const source of sources) {
    if (!source.ruleSearch) continue;
    try {
      if (author.trim()) {
        const exact = await preciseSearchBook(source, name, author.trim());
        if (exact) return exact;
      }
      const results = await searchBook(source, name);
      const loose = results.find((r) => r.name === name);
      if (loose && !author) return loose;
    } catch {
      /* 尝试下一书源 */
    }
  }
  return null;
}

export async function importBookshelfFromJson(
  jsonText: string,
  groupId?: number,
): Promise<ImportBookshelfResult> {
  const entries = parseBookshelfJson(jsonText);
  const result: ImportBookshelfResult = {
    total: entries.length,
    added: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const entry of entries) {
    if (!entry.name) {
      result.skipped += 1;
      continue;
    }

    const existing = await booksDb.getBookByNameAndAuthor(
      entry.name,
      entry.author ?? '',
    );
    if (existing) {
      result.skipped += 1;
      continue;
    }

    try {
      const found = await preciseSearchOne(entry.name, entry.author ?? '');
      if (!found) {
        result.failed += 1;
        result.errors.push(`未找到：${entry.name} / ${entry.author}`);
        continue;
      }
      await addSearchBookToShelf(found, {
        groupId: groupId && groupId > 0 ? groupId : undefined,
        fetchChapters: 'background',
      });
      result.added += 1;
    } catch (e) {
      result.failed += 1;
      result.errors.push(
        `${entry.name}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return result;
}

export async function importBookshelf(
  str: string,
  groupId?: number,
): Promise<ImportBookshelfResult> {
  const text = await loadBookshelfImportText(str);
  return importBookshelfFromJson(text, groupId);
}
