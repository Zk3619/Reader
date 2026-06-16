import {
  effectiveBookshelfManageGroupIds,
  effectiveBookshelfManageSourceNames,
  hasEffectiveBookshelfManageFilter,
} from '@/lib/bookshelf/bookshelf-manage-prefs';
import { getBookshelfBookSourceName } from '@/lib/bookshelf/book-source-name';
import { bookshelfManageBookMatchesSearch } from '@/lib/search/search-filters';
import type { SearchMode } from '@/lib/search/search-prefs';
import type { Book } from '@/types';

export function bookshelfManagePageFilterIsPassThrough(
  books: readonly Book[],
  options: {
    filterByBookGroup: boolean;
    filterBySource: boolean;
    appliedBookGroupIds: number[];
    appliedSourceNames: string[];
    allBookGroupIds: number[];
    allSourceNames: string[];
    searchQuery: string;
  },
): boolean {
  return (
    books.length > 0 &&
    !hasEffectiveBookshelfManageFilter({
      filterByBookGroup: options.filterByBookGroup,
      filterBySource: options.filterBySource,
      appliedBookGroupIds: options.appliedBookGroupIds,
      appliedSourceNames: options.appliedSourceNames,
      allBookGroupIds: options.allBookGroupIds,
      allSourceNames: options.allSourceNames,
    }) &&
    !options.searchQuery.trim()
  );
}

export function bookshelfManagePageItemMatches(
  book: Book,
  options: {
    effGroupIds: number[];
    effSourceNames: string[];
    searchQuery: string;
    searchMode: SearchMode;
    groupNamesForBook: (book: Book) => string[];
  },
): boolean {
  if (
    options.effGroupIds.length > 0 &&
    !options.effGroupIds.some((gid) => gid > 0 && (book.group & gid) !== 0)
  ) {
    return false;
  }
  if (
    options.effSourceNames.length > 0 &&
    !options.effSourceNames.includes(getBookshelfBookSourceName(book))
  ) {
    return false;
  }
  return bookshelfManageBookMatchesSearch(
    book,
    options.searchQuery,
    options.searchMode,
    options.groupNamesForBook,
  );
}

export function resolveBookshelfManageEffectiveFilters(
  filterByBookGroup: boolean,
  filterBySource: boolean,
  appliedBookGroupIds: number[],
  appliedSourceNames: string[],
  allBookGroupIds: number[],
  allSourceNames: string[],
): { effGroupIds: number[]; effSourceNames: string[] } {
  return {
    effGroupIds: filterByBookGroup
      ? effectiveBookshelfManageGroupIds(appliedBookGroupIds, allBookGroupIds)
      : [],
    effSourceNames: filterBySource
      ? effectiveBookshelfManageSourceNames(appliedSourceNames, allSourceNames)
      : [],
  };
}
