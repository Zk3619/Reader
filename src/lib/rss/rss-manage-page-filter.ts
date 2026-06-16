import type { RssSource } from '@/types';
import type { BookSource } from '@/types';
import {
  hasEffectiveRssSourceListFilter,
  rssSourceMatchesCriteria,
  type RssSourceListFilterCriteria,
} from '@/lib/rss/rss-source-list-filter';
import {
  sortBookSources,
  type SourceSortMode,
} from '@/lib/sources/source-sort';

export function rssManageSourceMatchesSearch(source: RssSource, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    source.sourceName.toLowerCase().includes(q) ||
    source.sourceUrl.toLowerCase().includes(q) ||
    (source.sourceGroup?.toLowerCase().includes(q) ?? false)
  );
}

export function rssManagePageFilterIsPassThrough(
  sources: readonly RssSource[],
  criteria: RssSourceListFilterCriteria,
  allGroupNames: string[],
  allDomainNames: string[],
  searchQuery: string,
): boolean {
  return (
    sources.length > 0 &&
    !hasEffectiveRssSourceListFilter(criteria, allGroupNames, allDomainNames) &&
    !searchQuery.trim()
  );
}

export function rssManagePageItemMatches(
  source: RssSource,
  criteria: RssSourceListFilterCriteria,
  allGroupNames: string[],
  allDomainNames: string[],
  searchQuery: string,
): boolean {
  return (
    rssSourceMatchesCriteria(source, criteria, allGroupNames, allDomainNames) &&
    rssManageSourceMatchesSearch(source, searchQuery)
  );
}

export function sortRssSourcesCopy(
  sources: RssSource[],
  sortMode: SourceSortMode,
  sortReverse: boolean,
): RssSource[] {
  return sortBookSources(
    sources as unknown as BookSource[],
    sortMode,
    sortReverse,
  ) as unknown as RssSource[];
}
