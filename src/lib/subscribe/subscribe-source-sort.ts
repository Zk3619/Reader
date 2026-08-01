/**
 * 订阅源管理页排序
 */

import type { SubSourceRow } from '@/lib/database/subscribe';

export type SubscribeSourceSortMode = 'manual' | 'name' | 'url' | 'update-time';

export const SUBSCRIBE_MANAGE_SORT_OPTIONS: {
  value: SubscribeSourceSortMode;
  label: string;
}[] = [
  { value: 'manual', label: '手动排序' },
  { value: 'name', label: '名称排序' },
  { value: 'url', label: '地址排序' },
  { value: 'update-time', label: '更新时间排序' },
];

/** 管理页分类筛选：全部 / 未分类 / 具体分类名 */
export const SUBSCRIBE_MANAGE_FILTER_ALL = '__all__';
export const SUBSCRIBE_MANAGE_FILTER_UNCATEGORIZED = '__uncategorized__';

/**
 * 表单/下拉用「未分类」哨兵。
 * 勿用空字符串作 Select value：Kobalte 会显示空白且列表项错乱。
 */
export const SUBSCRIBE_CATEGORY_SELECT_UNCATEGORIZED =
  SUBSCRIBE_MANAGE_FILTER_UNCATEGORIZED;

export function subscribeManageFilterLabel(value: string): string {
  if (value === SUBSCRIBE_MANAGE_FILTER_ALL) return '全部分类';
  if (value === SUBSCRIBE_MANAGE_FILTER_UNCATEGORIZED) return '未分类';
  return value;
}

/** DB/业务 category → Select value */
export function toSubscribeCategorySelectValue(
  category: string | undefined | null,
): string {
  const trimmed = String(category ?? '').trim();
  return trimmed || SUBSCRIBE_CATEGORY_SELECT_UNCATEGORIZED;
}

/** Select value → 入库 category（未分类为 ''） */
export function fromSubscribeCategorySelectValue(value: string): string {
  return value === SUBSCRIBE_CATEGORY_SELECT_UNCATEGORIZED ? '' : value.trim();
}

export function subscribeCategorySelectLabel(value: string): string {
  return subscribeManageFilterLabel(
    value === '' ? SUBSCRIBE_CATEGORY_SELECT_UNCATEGORIZED : value,
  );
}

export function filterSubscribeSourcesByManageCategory(
  sources: SubSourceRow[],
  filter: string,
): SubSourceRow[] {
  if (filter === SUBSCRIBE_MANAGE_FILTER_ALL) return sources;
  if (filter === SUBSCRIBE_MANAGE_FILTER_UNCATEGORIZED) {
    return sources.filter((s) => !s.category.trim());
  }
  return sources.filter((s) => s.category.trim() === filter);
}

export function sortSubscribeSourcesCopy(
  sources: SubSourceRow[],
  mode: SubscribeSourceSortMode,
  reverse: boolean,
): SubSourceRow[] {
  const list = [...sources];
  const dir = reverse ? -1 : 1;

  const cmpManual = (a: SubSourceRow, b: SubSourceRow) =>
    a.category.localeCompare(b.category, 'zh-CN') ||
    a.sortOrder - b.sortOrder ||
    (a.title || a.url).localeCompare(b.title || b.url, 'zh-CN');

  switch (mode) {
    case 'manual':
      list.sort((a, b) => dir * cmpManual(a, b));
      break;
    case 'name':
      list.sort(
        (a, b) =>
          dir * (a.title || a.url).localeCompare(b.title || b.url, 'zh-CN') ||
          cmpManual(a, b),
      );
      break;
    case 'url':
      list.sort(
        (a, b) => dir * a.url.localeCompare(b.url, 'zh-CN') || cmpManual(a, b),
      );
      break;
    case 'update-time':
      list.sort(
        (a, b) =>
          dir * ((b.lastFetchAt ?? 0) - (a.lastFetchAt ?? 0)) || cmpManual(a, b),
      );
      break;
  }
  return list;
}
