/**
 * 探索页书籍列表布局：解析 store 设置，对齐书架列表 / 网格行为
 */

import { createSignal, onCleanup, onMount } from 'solid-js';
import {
  getBookshelfListColumnLayout,
  getViewModeCardLayout,
  getViewModeContainerGridClass,
  getViewModeGridColumnCount,
  isGridViewMode,
  type ViewMode,
} from '@/lib/bookshelf/bookshelf-layout-settings';
import { getBookshelfListRowHeightPx } from '@/lib/bookshelf/bookshelf-list-layout';
import { bookshelfLayoutSpacingToPx } from '@/lib/bookshelf/bookshelf-layout-gap';
import type { ExplorePageLayoutSettings } from '@/stores/explore-page-layout';

/** 修改前的响应式网格（1/2/3/4 列断点 + gap-2） */
export const EXPLORE_RESPONSIVE_GRID_CLASS =
  'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2';

/** 与 exploreBookListCardClass 的 h-44 一致 */
export const EXPLORE_RESPONSIVE_CARD_HEIGHT_PX = 176;

export const EXPLORE_RESPONSIVE_GRID_GAP_PX = 8;

/** 卡片行高 + grid gap-2，供按行虚拟列表使用 */
export const EXPLORE_RESPONSIVE_ROW_HEIGHT_PX =
  EXPLORE_RESPONSIVE_CARD_HEIGHT_PX + EXPLORE_RESPONSIVE_GRID_GAP_PX;

const EXPLORE_GRID_MEDIA_QUERIES = [
  '(min-width: 768px)',
  '(min-width: 1024px)',
  '(min-width: 1536px)',
] as const;

/** 与 EXPLORE_RESPONSIVE_GRID_CLASS 断点列数对齐 */
export function resolveExploreResponsiveColumnCount(): number {
  if (typeof window === 'undefined') return 1;
  if (window.matchMedia('(min-width: 1536px)').matches) return 4;
  if (window.matchMedia('(min-width: 1024px)').matches) return 3;
  if (window.matchMedia('(min-width: 768px)').matches) return 2;
  return 1;
}

/** 随窗口宽度更新列数（默认响应式布局、虚拟网格、骨架屏共用） */
export function useExploreResponsiveColumnCount() {
  const [cols, setCols] = createSignal(resolveExploreResponsiveColumnCount());

  onMount(() => {
    const sync = () => setCols(resolveExploreResponsiveColumnCount());
    const queries = EXPLORE_GRID_MEDIA_QUERIES.map((q) => window.matchMedia(q));
    for (const mq of queries) {
      mq.addEventListener('change', sync);
    }
    onCleanup(() => {
      for (const mq of queries) {
        mq.removeEventListener('change', sync);
      }
    });
  });

  return cols;
}

export function isExploreDefaultLayoutMode(settings: ExplorePageLayoutSettings): boolean {
  return settings.dataLayoutMode === 'default';
}

export function usesBookshelfLayoutGap(settings: ExplorePageLayoutSettings): boolean {
  return settings.dataLayoutMode === 'card-list' || settings.dataLayoutMode === 'card-grid';
}

export function getExploreEffectiveViewMode(settings: ExplorePageLayoutSettings): ViewMode | null {
  if (settings.dataLayoutMode === 'card-list') return settings.cardListViewMode;
  if (settings.dataLayoutMode === 'card-grid') return settings.cardGridViewMode;
  return null;
}

export function getExploreListColumnCount(settings: ExplorePageLayoutSettings): number {
  if (settings.dataLayoutMode === 'text-list') return 1;
  if (settings.dataLayoutMode === 'default') return resolveExploreResponsiveColumnCount();
  const viewMode = getExploreEffectiveViewMode(settings);
  if (!viewMode) return 1;
  if (isGridViewMode(viewMode)) return getViewModeGridColumnCount(viewMode);
  return getBookshelfListColumnLayout(viewMode);
}

export function getExploreListGridClass(settings: ExplorePageLayoutSettings): string {
  if (settings.dataLayoutMode === 'text-list') {
    return 'grid grid-cols-1 gap-0';
  }
  if (settings.dataLayoutMode === 'default') {
    return EXPLORE_RESPONSIVE_GRID_CLASS;
  }
  const viewMode = getExploreEffectiveViewMode(settings);
  if (!viewMode) return 'grid grid-cols-1';
  return `grid bookshelf-layout-gap ${getViewModeContainerGridClass(viewMode)}`;
}

export function getExploreCardLayout(
  settings: ExplorePageLayoutSettings,
): 'list' | 'compact' | 'grid' | 'text' {
  if (settings.dataLayoutMode === 'text-list') return 'text';
  if (settings.dataLayoutMode === 'card-grid') return 'grid';
  if (settings.dataLayoutMode === 'default') return 'list';
  const viewMode = settings.cardListViewMode;
  return getViewModeCardLayout(viewMode) as 'list' | 'compact';
}

export function getExploreListRowHeightPx(settings: ExplorePageLayoutSettings): number {
  if (settings.dataLayoutMode === 'text-list') {
    return settings.dataDisplayMode === 'compact' ? 40 : 56;
  }
  if (settings.dataLayoutMode === 'default') {
    return EXPLORE_RESPONSIVE_ROW_HEIGHT_PX;
  }
  if (settings.dataLayoutMode === 'card-grid') {
    return 280;
  }
  const cardLayout = getExploreCardLayout(settings);
  if (cardLayout === 'compact') {
    return getBookshelfListRowHeightPx('compact');
  }
  return getBookshelfListRowHeightPx('list');
}

export function getExploreListRowEstimatePx(
  settings: ExplorePageLayoutSettings,
  index: number,
  total: number,
): number {
  const cardHeight = getExploreListRowHeightPx(settings);
  if (settings.dataLayoutMode === 'text-list') {
    return cardHeight;
  }
  if (settings.dataLayoutMode === 'default') {
    return cardHeight;
  }
  const gapPx = bookshelfLayoutSpacingToPx(settings.spacing);
  return cardHeight + (index >= total - 1 ? 0 : gapPx);
}

export function shouldUseResponsiveRowHeight(settings: ExplorePageLayoutSettings): boolean {
  return settings.dataLayoutMode === 'card-grid';
}

/** @deprecated 使用 EXPLORE_RESPONSIVE_GRID_CLASS */
export const EXPLORE_BOOK_GRID_CLASS = EXPLORE_RESPONSIVE_GRID_CLASS;

/** @deprecated 使用 EXPLORE_RESPONSIVE_CARD_HEIGHT_PX */
export const EXPLORE_BOOK_CARD_HEIGHT_PX = EXPLORE_RESPONSIVE_CARD_HEIGHT_PX;

/** @deprecated 使用 EXPLORE_RESPONSIVE_GRID_GAP_PX */
export const EXPLORE_BOOK_GRID_GAP_PX = EXPLORE_RESPONSIVE_GRID_GAP_PX;

/** @deprecated 使用 EXPLORE_RESPONSIVE_ROW_HEIGHT_PX */
export const EXPLORE_BOOK_GRID_ROW_HEIGHT_PX = EXPLORE_RESPONSIVE_ROW_HEIGHT_PX;

/** @deprecated 使用 resolveExploreResponsiveColumnCount */
export const resolveExploreGridColumnCount = resolveExploreResponsiveColumnCount;

/** @deprecated 使用 useExploreResponsiveColumnCount */
export const useExploreGridColumnCount = useExploreResponsiveColumnCount;
