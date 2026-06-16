import { fuzzyMatchQuery } from '@/lib/sources/source-list-filter';
import { getBookshelfBookSourceName } from '@/lib/bookshelf/book-source-name';
import { bookshelfLocalSearchMode, matchesSearchMode } from '@/lib/search/search-match';
import type { Book, BookGroup, BookSource, RssSource } from '@/types';
import type { SearchMode } from '@/lib/search/search-prefs';

/** 书架：常规=书名/作者连续包含；模糊=书名/作者字符序；扩展=书名/作者/分类/简介字符序 */
export function bookshelfBookMatchesSearch(
  book: Book,
  query: string,
  mode: SearchMode,
): boolean {
  const q = query.trim();
  if (!q) return true;
  const localMode = bookshelfLocalSearchMode(mode);
  return matchesSearchMode(
    {
      name: book.name || '',
      author: book.author ?? '',
      kind: book.kind,
      intro: book.intro,
    },
    q,
    localMode,
  );
}

export function filterBookshelfBooks(books: Book[], query: string, mode: SearchMode): Book[] {
  const q = query.trim();
  if (!q) return books;
  return books.filter((b) => bookshelfBookMatchesSearch(b, q, mode));
}

/** 书架管理：常规=书名；模糊=书名；扩展=书名+分组名+来源（模糊） */
export function bookshelfManageBookMatchesSearch(
  book: Book,
  query: string,
  mode: SearchMode,
  groupNamesForBook: (book: Book) => string[],
): boolean {
  const q = query.trim();
  if (!q) return true;
  const qLower = q.toLowerCase();
  const name = book.name || '';
  if (mode === 'fuzzy') {
    return fuzzyMatchQuery(q, name);
  }
  if (mode === 'extended') {
    const sourceName = getBookshelfBookSourceName(book);
    const groups = groupNamesForBook(book);
    return (
      fuzzyMatchQuery(q, name) ||
      groups.some((g) => fuzzyMatchQuery(q, g)) ||
      fuzzyMatchQuery(q, sourceName)
    );
  }
  return name.toLowerCase().includes(qLower);
}

export function filterBookshelfManageBooks(
  books: Book[],
  query: string,
  mode: SearchMode,
  groupNamesForBook: (book: Book) => string[],
): Book[] {
  const q = query.trim();
  if (!q) return books;
  return books.filter((b) => bookshelfManageBookMatchesSearch(b, q, mode, groupNamesForBook));
}

/** 书源：常规=书源名；模糊=书源名；扩展=书源名+URL（模糊） */
export function bookSourceMatchesSearch(
  source: BookSource,
  query: string,
  mode: SearchMode,
): boolean {
  const q = query.trim();
  if (!q) return true;
  const qLower = q.toLowerCase();
  const name = source.sourceName || '';
  if (mode === 'fuzzy') {
    return fuzzyMatchQuery(q, name);
  }
  if (mode === 'extended') {
    return fuzzyMatchQuery(q, name) || fuzzyMatchQuery(q, source.sourceUrl || '');
  }
  return name.toLowerCase().includes(qLower);
}

export function filterBookSources(sources: BookSource[], query: string, mode: SearchMode): BookSource[] {
  const q = query.trim();
  if (!q) return sources;
  return sources.filter((s) => bookSourceMatchesSearch(s, q, mode));
}

/** 订阅源：常规=名称；模糊=名称；扩展=名称+URL+分组（模糊） */
export function rssSourceMatchesSearch(
  source: RssSource,
  query: string,
  mode: SearchMode,
): boolean {
  const q = query.trim();
  if (!q) return true;
  const qLower = q.toLowerCase();
  const name = source.sourceName || '';
  const group = source.sourceGroup || '';
  if (mode === 'fuzzy') {
    return fuzzyMatchQuery(q, name);
  }
  if (mode === 'extended') {
    return (
      fuzzyMatchQuery(q, name) ||
      fuzzyMatchQuery(q, source.sourceUrl || '') ||
      fuzzyMatchQuery(q, group)
    );
  }
  return (
    name.toLowerCase().includes(qLower) ||
    source.sourceUrl.toLowerCase().includes(qLower) ||
    group.toLowerCase().includes(qLower)
  );
}

export function filterRssSources(sources: RssSource[], query: string, mode: SearchMode): RssSource[] {
  const q = query.trim();
  if (!q) return sources;
  return sources.filter((s) => rssSourceMatchesSearch(s, q, mode));
}

/** 分组管理：常规=分组名包含；模糊=分组名字符序匹配 */
export function bookGroupMatchesSearch(
  group: BookGroup,
  query: string,
  displayName: (g: BookGroup) => string,
  mode: SearchMode = 'name',
): boolean {
  const q = query.trim();
  if (!q) return true;
  const qLower = q.toLowerCase();
  const name = displayName(group);
  if (mode === 'fuzzy') {
    return fuzzyMatchQuery(q, name);
  }
  return name.toLowerCase().includes(qLower);
}

export function filterBookGroups(
  groups: BookGroup[],
  query: string,
  displayName: (g: BookGroup) => string,
  mode: SearchMode = 'name',
): BookGroup[] {
  const q = query.trim();
  if (!q) return groups;
  return groups.filter((g) => bookGroupMatchesSearch(g, q, displayName, mode));
}
