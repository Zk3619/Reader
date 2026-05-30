import { fuzzyMatchQuery } from '@/lib/sources/source-list-filter';
import { getBookshelfBookSourceName } from '@/lib/bookshelf/book-source-name';
import type { Book, BookGroup, BookSource } from '@/types';
import type { SearchMode } from '@/lib/search/search-prefs';

/** 书架：常规=书名；模糊=书名；扩展=书名+作者（模糊） */
export function filterBookshelfBooks(books: Book[], query: string, mode: SearchMode): Book[] {
  const q = query.trim();
  if (!q) return books;
  const qLower = q.toLowerCase();
  return books.filter((b) => {
    const name = b.name || '';
    if (mode === 'fuzzy') {
      return fuzzyMatchQuery(q, name);
    }
    if (mode === 'extended') {
      return fuzzyMatchQuery(q, name) || fuzzyMatchQuery(q, b.author ?? '');
    }
    return name.toLowerCase().includes(qLower);
  });
}

/** 书架管理：常规=书名；模糊=书名；扩展=书名+分组名+来源（模糊） */
export function filterBookshelfManageBooks(
  books: Book[],
  query: string,
  mode: SearchMode,
  groupNamesForBook: (book: Book) => string[],
): Book[] {
  const q = query.trim();
  if (!q) return books;
  const qLower = q.toLowerCase();
  return books.filter((b) => {
    const name = b.name || '';
    if (mode === 'fuzzy') {
      return fuzzyMatchQuery(q, name);
    }
    if (mode === 'extended') {
      const sourceName = getBookshelfBookSourceName(b);
      const groups = groupNamesForBook(b);
      return (
        fuzzyMatchQuery(q, name) ||
        groups.some((g) => fuzzyMatchQuery(q, g)) ||
        fuzzyMatchQuery(q, sourceName)
      );
    }
    return name.toLowerCase().includes(qLower);
  });
}

/** 书源：常规=书源名；模糊=书源名；扩展=书源名+URL（模糊） */
export function filterBookSources(sources: BookSource[], query: string, mode: SearchMode): BookSource[] {
  const q = query.trim();
  if (!q) return sources;
  const qLower = q.toLowerCase();
  return sources.filter((s) => {
    const name = s.sourceName || '';
    if (mode === 'fuzzy') {
      return fuzzyMatchQuery(q, name);
    }
    if (mode === 'extended') {
      return fuzzyMatchQuery(q, name) || fuzzyMatchQuery(q, s.sourceUrl || '');
    }
    return name.toLowerCase().includes(qLower);
  });
}

/** 分组管理：常规=分组名包含；模糊=分组名字符序匹配 */
export function filterBookGroups(
  groups: BookGroup[],
  query: string,
  displayName: (g: BookGroup) => string,
  mode: SearchMode = 'name',
): BookGroup[] {
  const q = query.trim();
  if (!q) return groups;
  const qLower = q.toLowerCase();
  return groups.filter((g) => {
    const name = displayName(g);
    if (mode === 'fuzzy') {
      return fuzzyMatchQuery(q, name);
    }
    return name.toLowerCase().includes(qLower);
  });
}
