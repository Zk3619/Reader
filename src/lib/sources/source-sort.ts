/**
 * 书源列表排序
 */

import type { BookSource } from '@/types';

export type SourceSortMode = 'manual' | 'smart' | 'name' | 'url' | 'update-time' | 'respond-time';

export const SOURCE_PAGE_SORT_OPTIONS: { value: SourceSortMode; label: string }[] = [
  { value: 'manual', label: '手动排序' },
  { value: 'name', label: '名称排序' },
  { value: 'url', label: '地址排序' },
  { value: 'update-time', label: '更新时间排序' },
  { value: 'respond-time', label: '响应时间排序' },
];

export const SOURCE_MANAGE_SORT_OPTIONS: { value: SourceSortMode; label: string }[] = [
  { value: 'manual', label: '手动排序' },
  { value: 'smart', label: '智能排序' },
  { value: 'name', label: '名称排序' },
  { value: 'url', label: '地址排序' },
  { value: 'update-time', label: '更新时间排序' },
  { value: 'respond-time', label: '响应时间排序' },
];

export type SourceManageGroupMode = 'flat' | 'by-group' | 'by-domain';

export function sortBookSources(
  sources: BookSource[],
  mode: SourceSortMode,
  reverse: boolean,
): BookSource[] {
  const list = [...sources];
  const dir = reverse ? -1 : 1;

  const cmpOrder = (a: BookSource, b: BookSource) =>
    (a.customOrder ?? 0) - (b.customOrder ?? 0);

  switch (mode) {
    case 'manual':
      list.sort((a, b) => dir * cmpOrder(a, b));
      break;
    case 'smart':
      list.sort(
        (a, b) =>
          dir * ((b.weight ?? 0) - (a.weight ?? 0)) || cmpOrder(a, b),
      );
      break;
    case 'name':
      list.sort(
        (a, b) =>
          dir * a.sourceName.localeCompare(b.sourceName, 'zh-CN') || cmpOrder(a, b),
      );
      break;
    case 'url':
      list.sort(
        (a, b) =>
          dir * a.sourceUrl.localeCompare(b.sourceUrl, 'zh-CN') || cmpOrder(a, b),
      );
      break;
    case 'update-time':
      list.sort(
        (a, b) =>
          dir * ((b.lastUpdateTime ?? 0) - (a.lastUpdateTime ?? 0)) || cmpOrder(a, b),
      );
      break;
    case 'respond-time':
      list.sort(
        (a, b) =>
          dir * ((a.respondTime ?? 0) - (b.respondTime ?? 0)) || cmpOrder(a, b),
      );
      break;
  }
  return list;
}

/** 从书源 URL 提取域名，用于按域名分组显示 */
export function getSourceDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./i, '') || url;
  } catch {
    const m = url.match(/^https?:\/\/([^/?#]+)/i);
    return m?.[1]?.replace(/^www\./i, '') ?? '未知';
  }
}
