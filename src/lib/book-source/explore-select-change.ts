/**
 * 发现项 Select 变更：书源抽屉与探索页共用，保证 infoMap / 书源变量 / action 一致。
 */

import type { BookSource } from '@/types';
import type { ExploreSection } from '@/lib/book-source/explore-sections';
import {
  clearExploreSectionsCache,
  updateExploreSourceArgument,
} from '@/lib/book-source/explore-sections';
import {
  getExploreInfoMap,
  setExploreInfoMapValue,
} from '@/lib/book-source/explore-info-map-store';
import { runExploreSectionAction } from '@/lib/js-engine/legado/explore-section-action-runner';
import { createScriptNoticeBus } from '@/lib/book-source/rate-limit-guard';
import { getLegadoSourceKey } from '@/lib/js-engine/legado/source-script-shared';

export type ApplyExploreSelectChangeOptions = {
  onRefreshExplore?: () => void | Promise<void>;
  onOpenSearch?: (query: string, source: BookSource) => void;
};

/** 与书源发现抽屉 `handleExploreSelectChange` 对齐 */
export async function applyExploreSelectChange(
  source: BookSource,
  section: ExploreSection,
  value: string,
  options?: ApplyExploreSelectChangeOptions,
): Promise<void> {
  const sourceKey = getLegadoSourceKey(source);
  setExploreInfoMapValue(sourceKey, section.title, value);

  if (section.paramKey) {
    updateExploreSourceArgument(source, section.paramKey, value);
  }

  const action = section.action?.trim();
  if (action) {
    const noticeBus = createScriptNoticeBus(source.sourceName, '发现');
    try {
      await runExploreSectionAction(source, action, {
        infoMap: getExploreInfoMap(sourceKey),
        onScriptToast: noticeBus.onScriptToast,
        onRefreshExplore: options?.onRefreshExplore,
        onOpenSearch: options?.onOpenSearch,
      });
    } catch (e) {
      console.error('发现筛选 action 失败:', e);
    }
    if (!section.paramKey) {
      clearExploreSectionsCache(sourceKey);
      await options?.onRefreshExplore?.();
    }
    return;
  }

  if (!section.paramKey) return;
  await options?.onRefreshExplore?.();
}
