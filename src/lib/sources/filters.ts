/**
 * 书源分组下拉中的特殊筛选项（非真实分组名）
 */

export const SOURCE_FILTER_ENABLED = '__filter:enabled__';
export const SOURCE_FILTER_DISABLED = '__filter:disabled__';
export const SOURCE_FILTER_NEED_LOGIN = '__filter:need_login__';
export const SOURCE_FILTER_UNGROUPED = '__filter:ungrouped__';
export const SOURCE_FILTER_EXPLORE_ENABLED = '__filter:explore_enabled__';
export const SOURCE_FILTER_EXPLORE_DISABLED = '__filter:explore_disabled__';

export const SOURCE_FILTER_VALUES = [
  SOURCE_FILTER_ENABLED,
  SOURCE_FILTER_DISABLED,
  SOURCE_FILTER_NEED_LOGIN,
  SOURCE_FILTER_UNGROUPED,
  SOURCE_FILTER_EXPLORE_ENABLED,
  SOURCE_FILTER_EXPLORE_DISABLED,
] as const;

export type SourceFilterValue = (typeof SOURCE_FILTER_VALUES)[number];

const LABELS: Record<string, string> = {
  [SOURCE_FILTER_ENABLED]: '已启用',
  [SOURCE_FILTER_DISABLED]: '已禁用',
  [SOURCE_FILTER_NEED_LOGIN]: '需要登录',
  [SOURCE_FILTER_UNGROUPED]: '未分组',
  [SOURCE_FILTER_EXPLORE_ENABLED]: '已启用发现',
  [SOURCE_FILTER_EXPLORE_DISABLED]: '已禁用发现',
  /** 旧筛选项 id（重命名前） */
  '__filter:discover_enabled__': '已启用发现',
  '__filter:discover_disabled__': '已禁用发现',
};

/** 将旧 discover 筛选项 id 规范为 explore */
export function normalizeSourceFilterValue(value: string | null): string | null {
  if (value === '__filter:discover_enabled__') return SOURCE_FILTER_EXPLORE_ENABLED;
  if (value === '__filter:discover_disabled__') return SOURCE_FILTER_EXPLORE_DISABLED;
  return value;
}

/** 是否为特殊筛选（全部、已启用、已禁用等），即「按分组名显示」仅在这些项时有效 */
export function isSourceFilterOrAll(value: string | null): boolean {
  if (value == null || value === '') return true;
  const normalized = normalizeSourceFilterValue(value);
  return SOURCE_FILTER_VALUES.includes(normalized as SourceFilterValue);
}

/** 获取当前选中项的显示文案（全部 / 筛选名 / 分组名） */
export function getSourceGroupLabel(value: string | null): string {
  if (value == null || value === '') return '全部';
  const normalized = normalizeSourceFilterValue(value);
  return LABELS[normalized ?? value] ?? LABELS[value] ?? value;
}

/** 书源列表搜索模式（由 sources_page_prefs 持久化） */
export type { SearchMode as SourceSearchMode } from '@/lib/search/search-prefs';

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
