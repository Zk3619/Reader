import type { BookSource } from '@/types';
import type { SearchMode } from '@/lib/search/search-prefs';
import {
  hasEffectiveSourceListFilter,
  sourceMatchesCriteria,
  type SourceListFilterCriteria,
} from '@/lib/sources/source-list-filter';
import { bookSourceMatchesSearch } from '@/lib/search/search-filters';
import {
  sortBookSources,
  type SourceSortMode,
} from '@/lib/sources/source-sort';

export function bookSourcePageFilterIsPassThrough(
  sources: readonly BookSource[],
  criteria: SourceListFilterCriteria,
  allGroupNames: string[],
  searchQuery: string,
): boolean {
  return (
    sources.length > 0 &&
    !hasEffectiveSourceListFilter(criteria, allGroupNames) &&
    !searchQuery.trim()
  );
}

export function bookSourcePageItemMatches(
  source: BookSource,
  criteria: SourceListFilterCriteria,
  allGroupNames: string[],
  searchQuery: string,
  searchMode: SearchMode,
): boolean {
  return (
    sourceMatchesCriteria(source, criteria, allGroupNames) &&
    bookSourceMatchesSearch(source, searchQuery, searchMode)
  );
}

export function sortBookSourcesCopy(
  sources: BookSource[],
  sortMode: SourceSortMode,
  sortReverse: boolean,
): BookSource[] {
  return sortBookSources(sources, sortMode, sortReverse);
}
