import { fuzzyMatchQuery } from '@/lib/sources/source-list-filter';
import type { SearchMode } from '@/lib/search/search-prefs';
import { isUnfilteredSearchMode } from '@/lib/search/search-prefs';

/** 参与匹配的书籍字段（在线搜索 / 书架本地搜索共用） */
export interface SearchMatchFields {
  name: string;
  author: string;
  kind?: string;
  intro?: string;
}

export type SearchResultBucket = 'equal' | 'tags' | 'contains' | 'other';

/** 连续子串匹配（常规搜索） */
export function continuousContains(text: string | undefined, key: string): boolean {
  if (!key) return true;
  if (!text) return false;
  return text.includes(key);
}

/** 本地书架筛选用的模式（不过滤仅作用于在线多源搜索） */
export function bookshelfLocalSearchMode(mode: SearchMode): SearchMode {
  return isUnfilteredSearchMode(mode) ? 'name' : mode;
}

/** 按搜索模式判断书籍是否命中（不过滤模式恒为 true） */
export function matchesSearchMode(
  fields: SearchMatchFields,
  key: string,
  mode: SearchMode,
): boolean {
  if (isUnfilteredSearchMode(mode)) return true;
  const k = key.trim();
  if (!k) return true;
  const { name, author, kind, intro } = fields;
  switch (mode) {
    case 'name':
      return continuousContains(name, k) || continuousContains(author, k);
    case 'fuzzy':
      return fuzzyMatchQuery(k, name) || fuzzyMatchQuery(k, author);
    case 'extended':
      return (
        fuzzyMatchQuery(k, name) ||
        fuzzyMatchQuery(k, author) ||
        fuzzyMatchQuery(k, kind ?? '') ||
        fuzzyMatchQuery(k, intro ?? '')
      );
    default:
      return true;
  }
}

/** 合并结果排序分桶 */
export function classifySearchResult(
  fields: SearchMatchFields,
  key: string,
  mode: SearchMode,
): SearchResultBucket {
  const k = key.trim();
  if (!k) return 'other';
  if (fields.name === k || fields.author === k) return 'equal';

  if (isUnfilteredSearchMode(mode)) {
    if (continuousContains(fields.kind, k)) return 'tags';
    if (continuousContains(fields.name, k) || continuousContains(fields.author, k)) {
      return 'contains';
    }
    return 'other';
  }

  const nameHit =
    mode === 'name'
      ? continuousContains(fields.name, k)
      : fuzzyMatchQuery(k, fields.name);
  const authorHit =
    mode === 'name'
      ? continuousContains(fields.author, k)
      : fuzzyMatchQuery(k, fields.author);
  if (nameHit || authorHit) return 'contains';

  if (mode === 'extended') {
    if (fuzzyMatchQuery(k, fields.kind ?? '')) return 'tags';
    if (fuzzyMatchQuery(k, fields.intro ?? '')) return 'other';
  }

  return 'other';
}

/** 展示「不含关键词」结果桶（扩展搜索 + 不过滤搜索） */
export function shouldIncludeOtherBucket(mode: SearchMode): boolean {
  return mode === 'extended' || isUnfilteredSearchMode(mode);
}

export function buildSearchBookFilter(
  mode: SearchMode,
  searchKey: string,
): (name: string, author: string, kind?: string, intro?: string) => boolean {
  if (isUnfilteredSearchMode(mode)) {
    return () => true;
  }
  return (name, author, kind, intro) =>
    matchesSearchMode({ name, author, kind, intro }, searchKey, mode);
}
