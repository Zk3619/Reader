/**
 * 订阅源筛选：分组 / 域名 / 启用状态 / 特殊条件
 */

import type { BookSource, RssSource } from '@/types';
import { getSourceDomain } from '@/lib/sources/source-sort';
import {
  UNGROUPED_SOURCE_LABEL,
  SOURCE_ENABLED_FILTER_OPTIONS,
  sourceMatchesGroup,
  type SourceEnabledFilter,
} from '@/lib/sources/source-list-filter';

export type RssSourceSpecialFilter = 'need_login' | 'ungrouped';

export interface RssSourceListFilterCriteria {
  groupNames: string[];
  domainNames: string[];
  enabledStates: SourceEnabledFilter[];
  specialFilters: RssSourceSpecialFilter[];
}

export const EMPTY_RSS_SOURCE_LIST_FILTER: RssSourceListFilterCriteria = {
  groupNames: [],
  domainNames: [],
  enabledStates: [],
  specialFilters: [],
};

export const RSS_SPECIAL_FILTER_OPTIONS: { value: RssSourceSpecialFilter; label: string }[] = [
  { value: 'need_login', label: '需要登录' },
  { value: 'ungrouped', label: '未分组' },
];

export { UNGROUPED_SOURCE_LABEL };

export function buildRssManageFilterGroupOptions(sourceGroups: string[]): string[] {
  return [...new Set(sourceGroups.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

export function buildRssManageFilterDomainOptions(sources: RssSource[]): string[] {
  const domains = new Set<string>();
  for (const source of sources) {
    domains.add(getSourceDomain(source.sourceUrl));
  }
  return [...domains].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

const allStateFilterValues = (): (SourceEnabledFilter | RssSourceSpecialFilter)[] => [
  ...SOURCE_ENABLED_FILTER_OPTIONS.map((o) => o.value),
  ...RSS_SPECIAL_FILTER_OPTIONS.map((o) => o.value),
];

export function normalizeRssSourceListFilter(
  criteria: RssSourceListFilterCriteria,
  allGroupNames: string[],
  allDomainNames: string[] = [],
): RssSourceListFilterCriteria {
  const groupNames =
    criteria.groupNames.length === 0 ||
    (allGroupNames.length > 0 && criteria.groupNames.length >= allGroupNames.length)
      ? []
      : criteria.groupNames;

  const domainNames =
    criteria.domainNames.length === 0 ||
    (allDomainNames.length > 0 && criteria.domainNames.length >= allDomainNames.length)
      ? []
      : criteria.domainNames;

  const stateCount = criteria.enabledStates.length + criteria.specialFilters.length;
  const totalStateCount = allStateFilterValues().length;
  const enabledStates =
    stateCount === 0 || stateCount >= totalStateCount ? [] : [...criteria.enabledStates];
  const specialFilters =
    stateCount === 0 || stateCount >= totalStateCount ? [] : [...criteria.specialFilters];

  return { groupNames, domainNames, enabledStates, specialFilters };
}

export function hasEffectiveRssSourceListFilter(
  criteria: RssSourceListFilterCriteria,
  allGroupNames: string[],
  allDomainNames: string[] = [],
): boolean {
  const n = normalizeRssSourceListFilter(criteria, allGroupNames, allDomainNames);
  return (
    n.groupNames.length > 0 ||
    n.domainNames.length > 0 ||
    n.enabledStates.length > 0 ||
    n.specialFilters.length > 0
  );
}

function rssMatchesSpecialFilter(source: RssSource, filter: RssSourceSpecialFilter): boolean {
  switch (filter) {
    case 'need_login':
      return !!(source.loginUrl?.trim() || source.loginCheckJs?.trim());
    case 'ungrouped':
      return !source.sourceGroup?.trim();
  }
}

export function rssSourceMatchesCriteria(
  source: RssSource,
  criteria: RssSourceListFilterCriteria,
  allGroupNames?: string[],
  allDomainNames?: string[],
): boolean {
  const c =
    allGroupNames !== undefined
      ? normalizeRssSourceListFilter(criteria, allGroupNames, allDomainNames ?? [])
      : criteria;
  if (c.groupNames.length > 0) {
    if (!c.groupNames.some((name) => sourceMatchesGroup(source as unknown as BookSource, name)))
      return false;
  }
  if (c.domainNames.length > 0) {
    if (!c.domainNames.includes(getSourceDomain(source.sourceUrl))) return false;
  }
  if (c.enabledStates.length > 0) {
    const state: SourceEnabledFilter = source.enabled ? 'enabled' : 'disabled';
    if (!c.enabledStates.includes(state)) return false;
  }
  if (c.specialFilters.length > 0) {
    if (!c.specialFilters.some((f) => rssMatchesSpecialFilter(source, f))) return false;
  }
  return true;
}

export function filterRssSourcesByCriteria(
  sources: RssSource[],
  criteria: RssSourceListFilterCriteria,
  allGroupNames?: string[],
  allDomainNames?: string[],
): RssSource[] {
  return sources.filter((s) => rssSourceMatchesCriteria(s, criteria, allGroupNames, allDomainNames));
}

export function formatRssSourceListFilterSummary(
  criteria: RssSourceListFilterCriteria,
  allGroupNames: string[] = [],
  allDomainNames: string[] = [],
): string {
  if (allGroupNames.length > 0 || allDomainNames.length > 0) {
    const effective = normalizeRssSourceListFilter(criteria, allGroupNames, allDomainNames);
    const parts: string[] = [];
    if (effective.groupNames.length > 0) {
      parts.push(effective.groupNames.length > 1 ? '多个分组' : effective.groupNames[0]!);
    }
    if (effective.domainNames.length > 0) {
      parts.push(effective.domainNames.length > 1 ? '多个域名' : effective.domainNames[0]!);
    }
    const stateCount = effective.enabledStates.length + effective.specialFilters.length;
    if (stateCount > 0) {
      if (stateCount > 1) parts.push('多个条件');
      else if (effective.enabledStates.length === 1) {
        parts.push(
          SOURCE_ENABLED_FILTER_OPTIONS.find((o) => o.value === effective.enabledStates[0])?.label ??
            '条件',
        );
      } else if (effective.specialFilters.length === 1) {
        parts.push(
          RSS_SPECIAL_FILTER_OPTIONS.find((o) => o.value === effective.specialFilters[0])?.label ??
            '条件',
        );
      }
    }
    if (parts.length > 0) return parts.join(' · ');
  }
  return '筛选';
}

function formatRssSourceListConditionLabel(criteria: RssSourceListFilterCriteria): string {
  const n = criteria.enabledStates.length + criteria.specialFilters.length;
  if (n > 1) return '多个条件';
  if (criteria.enabledStates.length === 1) {
    return (
      SOURCE_ENABLED_FILTER_OPTIONS.find((o) => o.value === criteria.enabledStates[0])?.label ??
      '条件'
    );
  }
  if (criteria.specialFilters.length === 1) {
    return (
      RSS_SPECIAL_FILTER_OPTIONS.find((o) => o.value === criteria.specialFilters[0])?.label ??
      '条件'
    );
  }
  return '多个条件';
}

export function formatRssSourceListToolbarDescription(opts: {
  criteria: RssSourceListFilterCriteria;
  allGroupNames: string[];
  allDomainNames?: string[];
  count: number;
}): string {
  const effective = normalizeRssSourceListFilter(
    opts.criteria,
    opts.allGroupNames,
    opts.allDomainNames ?? [],
  );
  const parts: string[] = [];
  if (effective.groupNames.length > 0) {
    parts.push(effective.groupNames.length > 1 ? '多个分组' : effective.groupNames[0]!);
  }
  if (effective.domainNames.length > 0) {
    parts.push(effective.domainNames.length > 1 ? '多个域名' : effective.domainNames[0]!);
  }
  if (effective.enabledStates.length > 0 || effective.specialFilters.length > 0) {
    parts.push(formatRssSourceListConditionLabel(effective));
  }
  parts.push(`共 ${opts.count} 个订阅源`);
  return parts.join(' · ');
}
