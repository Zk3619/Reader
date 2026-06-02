/**
 * 探索页 Tab 值：使用索引型安全 ID，避免书源 URL / 分类标题中的特殊字符破坏 querySelector
 */

export const EXPLORE_SOURCE_TAB_PREFIX = 'explore-src-';
export const EXPLORE_SECTION_TAB_PREFIX = 'explore-sec-';

export function exploreSourceTabValue(index: number): string {
  return `${EXPLORE_SOURCE_TAB_PREFIX}${index}`;
}

export function exploreSectionTabValue(index: number): string {
  return `${EXPLORE_SECTION_TAB_PREFIX}${index}`;
}

export function parseExploreIndexedTabValue(value: string, prefix: string): number | null {
  if (!value.startsWith(prefix)) return null;
  const idx = Number(value.slice(prefix.length));
  return Number.isInteger(idx) && idx >= 0 ? idx : null;
}
