/**
 * @deprecated 请使用 rss-source-list-filter.ts
 */

export {
  UNGROUPED_SOURCE_LABEL,
  EMPTY_RSS_SOURCE_LIST_FILTER,
  hasEffectiveRssSourceListFilter,
  type RssSourceListFilterCriteria,
} from '@/lib/rss/rss-source-list-filter';

/** @deprecated 使用 hasEffectiveRssSourceListFilter */
export function hasEffectiveRssGroupFilter(groupNames: string[]): boolean {
  return groupNames.length > 0;
}
