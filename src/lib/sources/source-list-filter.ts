/**
 * 书源列表筛选：分组 / 启用状态 / 特殊条件 + 搜索辅助
 */

import type { BookSource } from '@/types';

export type { SearchMode as SourceSearchMode } from '@/lib/search/search-prefs';

/** @deprecated 旧标题下拉 id，仅作兼容迁移 */
export const SOURCE_FILTER_ENABLED = '__filter:enabled__';
export const SOURCE_FILTER_DISABLED = '__filter:disabled__';
export const SOURCE_FILTER_NEED_LOGIN = '__filter:need_login__';
export const SOURCE_FILTER_UNGROUPED = '__filter:ungrouped__';
export const SOURCE_FILTER_EXPLORE_ENABLED = '__filter:explore_enabled__';
export const SOURCE_FILTER_EXPLORE_DISABLED = '__filter:explore_disabled__';

export type SourceEnabledFilter = 'enabled' | 'disabled';

export type SourceSpecialFilter = 'need_login' | 'explore_enabled' | 'explore_disabled';

export interface SourceListFilterCriteria {
  groupNames: string[];
  enabledStates: SourceEnabledFilter[];
  specialFilters: SourceSpecialFilter[];
}

export const EMPTY_SOURCE_LIST_FILTER: SourceListFilterCriteria = {
  groupNames: [],
  enabledStates: [],
  specialFilters: [],
};

export const UNGROUPED_SOURCE_LABEL = '未分组';

export const SOURCE_ENABLED_FILTER_OPTIONS: { value: SourceEnabledFilter; label: string }[] = [
  { value: 'enabled', label: '已启用' },
  { value: 'disabled', label: '已禁用' },
];

export const SOURCE_SPECIAL_FILTER_OPTIONS: { value: SourceSpecialFilter; label: string }[] = [
  { value: 'need_login', label: '需要登录' },
  { value: 'explore_enabled', label: '已启用发现' },
  { value: 'explore_disabled', label: '已禁用发现' },
];

/** 将旧 discover 筛选项 id 规范为 explore */
export function normalizeSourceFilterValue(value: string | null): string | null {
  if (value === '__filter:discover_enabled__') return SOURCE_FILTER_EXPLORE_ENABLED;
  if (value === '__filter:discover_disabled__') return SOURCE_FILTER_EXPLORE_DISABLED;
  return value;
}

/** 是否未限定到单个书源分组（用于「按分组名显示」） */
export function shouldGroupSourcesByGroupName(groupNames: string[]): boolean {
  if (groupNames.length === 0) return true;
  if (groupNames.length !== 1) return true;
  return groupNames[0] === UNGROUPED_SOURCE_LABEL;
}

/** @deprecated 使用 shouldGroupSourcesByGroupName */
export function isSourceFilterOrAll(value: string | null): boolean {
  if (value == null || value === '') return true;
  const normalized = normalizeSourceFilterValue(value);
  const specials = [
    SOURCE_FILTER_ENABLED,
    SOURCE_FILTER_DISABLED,
    SOURCE_FILTER_NEED_LOGIN,
    SOURCE_FILTER_UNGROUPED,
    SOURCE_FILTER_EXPLORE_ENABLED,
    SOURCE_FILTER_EXPLORE_DISABLED,
  ] as const;
  return specials.includes(normalized as (typeof specials)[number]);
}

/** 筛选弹窗中的全部分组选项（含「未分组」） */
export function buildSourceFilterGroupOptions(sourceGroups: string[]): string[] {
  const names = new Set(sourceGroups.filter(Boolean));
  names.add(UNGROUPED_SOURCE_LABEL);
  return [...names].sort((a, b) =>
    a === UNGROUPED_SOURCE_LABEL ? 1 : b === UNGROUPED_SOURCE_LABEL ? -1 : a.localeCompare(b, 'zh-CN'),
  );
}

const allStateFilterValues = (): (SourceEnabledFilter | SourceSpecialFilter)[] => [
  ...SOURCE_ENABLED_FILTER_OPTIONS.map((o) => o.value),
  ...SOURCE_SPECIAL_FILTER_OPTIONS.map((o) => o.value),
];

/** 全不选与全选均视为该维度不限制 */
export function normalizeSourceListFilter(
  criteria: SourceListFilterCriteria,
  allGroupNames: string[],
): SourceListFilterCriteria {
  const groupNames =
    criteria.groupNames.length === 0 ||
    (allGroupNames.length > 0 && criteria.groupNames.length >= allGroupNames.length)
      ? []
      : criteria.groupNames;

  const stateCount = criteria.enabledStates.length + criteria.specialFilters.length;
  const totalStateCount = allStateFilterValues().length;
  const enabledStates =
    stateCount === 0 || stateCount >= totalStateCount ? [] : [...criteria.enabledStates];
  const specialFilters =
    stateCount === 0 || stateCount >= totalStateCount ? [] : [...criteria.specialFilters];

  return { groupNames, enabledStates, specialFilters };
}

export function getEffectiveSourceListFilter(
  criteria: SourceListFilterCriteria,
  allGroupNames: string[],
): SourceListFilterCriteria {
  return normalizeSourceListFilter(criteria, allGroupNames);
}

export function hasActiveSourceListFilter(criteria: SourceListFilterCriteria): boolean {
  return (
    criteria.groupNames.length > 0 ||
    criteria.enabledStates.length > 0 ||
    criteria.specialFilters.length > 0
  );
}

/** 是否存在会缩小结果集的有效筛选（全选/全不选不算） */
export function hasEffectiveSourceListFilter(
  criteria: SourceListFilterCriteria,
  allGroupNames: string[],
): boolean {
  const n = normalizeSourceListFilter(criteria, allGroupNames);
  return n.groupNames.length > 0 || n.enabledStates.length > 0 || n.specialFilters.length > 0;
}

function formatSourceListConditionLabel(criteria: SourceListFilterCriteria): string {
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
      SOURCE_SPECIAL_FILTER_OPTIONS.find((o) => o.value === criteria.specialFilters[0])?.label ??
      '条件'
    );
  }
  return '多个条件';
}

function formatSourceListFilterParts(effective: SourceListFilterCriteria): string[] {
  const parts: string[] = [];
  if (effective.groupNames.length > 0) {
    parts.push(effective.groupNames.length > 1 ? '多个分组' : effective.groupNames[0]!);
  }
  if (effective.enabledStates.length > 0 || effective.specialFilters.length > 0) {
    parts.push(formatSourceListConditionLabel(effective));
  }
  return parts;
}

/** 页头描述：分组 · 条件 · 共 x 个书源 */
export function formatSourceListToolbarDescription(opts: {
  criteria: SourceListFilterCriteria;
  allGroupNames: string[];
  count: number;
}): string {
  const effective = normalizeSourceListFilter(opts.criteria, opts.allGroupNames);
  const parts = formatSourceListFilterParts(effective);
  parts.push(`共 ${opts.count} 个书源`);
  return parts.join(' · ');
}

export function formatSourceListFilterSummary(
  criteria: SourceListFilterCriteria,
  allGroupNames: string[] = [],
): string {
  if (allGroupNames.length > 0) {
    const effective = normalizeSourceListFilter(criteria, allGroupNames);
    const parts = formatSourceListFilterParts(effective);
    if (parts.length > 0) return parts.join(' · ');
  }
  const parts: string[] = [];
  if (criteria.groupNames.length > 0) {
    parts.push(`分组 ${criteria.groupNames.length} 项`);
  }
  if (criteria.enabledStates.length > 0) {
    parts.push(
      criteria.enabledStates
        .map((s) => SOURCE_ENABLED_FILTER_OPTIONS.find((o) => o.value === s)?.label ?? s)
        .join('、'),
    );
  }
  if (criteria.specialFilters.length > 0) {
    parts.push(
      criteria.specialFilters
        .map((s) => SOURCE_SPECIAL_FILTER_OPTIONS.find((o) => o.value === s)?.label ?? s)
        .join('、'),
    );
  }
  return parts.length > 0 ? parts.join(' · ') : '筛选';
}

/** 模糊匹配：关键词各字符在文本中按顺序出现（可不连续） */
export function fuzzyMatchQuery(query: string, text: string): boolean {
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  const t = (text || '').toLowerCase();
  let j = 0;
  for (let i = 0; i < t.length && j < q.length; i++) {
    if (t[i] === q[j]) j++;
  }
  return j === q.length;
}

/** 书源是否属于某分组名（支持逗号分隔多分组） */
export function sourceMatchesGroup(source: BookSource, groupName: string): boolean {
  if (groupName === UNGROUPED_SOURCE_LABEL) {
    return !source.sourceGroup || source.sourceGroup.trim() === '';
  }
  const g = (source.sourceGroup || '').trim();
  if (!g) return false;
  if (g === groupName) return true;
  return (
    g.startsWith(`${groupName},`) ||
    g.includes(`,${groupName},`) ||
    g.endsWith(`,${groupName}`)
  );
}

function sourceMatchesSpecialFilter(source: BookSource, filter: SourceSpecialFilter): boolean {
  switch (filter) {
    case 'need_login':
      return !!(source.loginUrl?.trim() || source.loginCheckJs?.trim());
    case 'explore_enabled':
      return source.enableExplore;
    case 'explore_disabled':
      return !source.enableExplore;
  }
}

/** 按筛选弹窗条件过滤书源（各维度内 OR，维度间 AND） */
export function filterSourcesByCriteria(
  sources: BookSource[],
  criteria: SourceListFilterCriteria,
  allGroupNames?: string[],
): BookSource[] {
  const c =
    allGroupNames !== undefined
      ? normalizeSourceListFilter(criteria, allGroupNames)
      : criteria;
  return sources.filter((s) => {
    if (c.groupNames.length > 0) {
      if (!c.groupNames.some((name) => sourceMatchesGroup(s, name))) return false;
    }
    if (c.enabledStates.length > 0) {
      const state: SourceEnabledFilter = s.enabled ? 'enabled' : 'disabled';
      if (!c.enabledStates.includes(state)) return false;
    }
    if (c.specialFilters.length > 0) {
      if (!c.specialFilters.some((f) => sourceMatchesSpecialFilter(s, f))) return false;
    }
    return true;
  });
}

/** @deprecated 使用 filterSourcesByCriteria */
export function filterSourcesByDialogCriteria(
  sources: BookSource[],
  selectedGroups: string[],
  selectedEnabled: SourceEnabledFilter[],
): BookSource[] {
  return filterSourcesByCriteria(sources, {
    groupNames: selectedGroups,
    enabledStates: selectedEnabled,
    specialFilters: [],
  });
}
