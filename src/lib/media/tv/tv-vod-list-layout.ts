/**
 * 影视点播列表布局：固定列数（书架式）+ 卡片随列宽拉伸；
 * 番剧等场景另支持按容器宽度映射列数（对齐搜索页断点档位）。
 */

import type { VirtualGridRowLayoutMetrics } from '@/components/shared/virtual-list';
import { bookshelfLayoutSpacingToPx } from '@/lib/bookshelf/bookshelf-layout-gap';

export const TV_VOD_LIST_HORIZONTAL_PADDING_PX = 16;

/**
 * 番剧搜索/浏览响应式网格间距（对齐 `gap-2`）。
 * 列数档位对齐：`grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8`。
 */
export const BANGUMI_RESPONSIVE_GAP_PX = 8;

/** Tailwind sm / md / lg 断点宽度，按**容器**而非 window 判定 */
const BANGUMI_RESPONSIVE_COL_BREAKPOINTS = [
  { minWidth: 1024, cols: 8 },
  { minWidth: 768, cols: 6 },
  { minWidth: 640, cols: 4 },
] as const;

/** 按列表容器宽度解析列数（侧栏缩窄内容区时比 window.matchMedia 更准） */
export function resolveBangumiResponsiveColumnCount(containerWidth: number): number {
  if (containerWidth <= 0) return 3;
  for (const bp of BANGUMI_RESPONSIVE_COL_BREAKPOINTS) {
    if (containerWidth >= bp.minWidth) return bp.cols;
  }
  return 3;
}

/** 点播虚拟列表列数策略 */
export type TvVodColumnStrategy = 'viewMode' | 'container-responsive';
/** 行顶留白：悬停抬升（不计入「卡片边到边」间距，只占行内容高度） */
export const TV_VOD_ROW_HOVER_PAD_PX = 4;
/** 竖卡内边距合计（p-1 × 2） */
export const TV_VOD_GRID_CARD_PADDING_PX = 8;
/** 封面与标题间距（gap-1） */
export const TV_VOD_GRID_INNER_GAP_PX = 4;
/** 标题区上内边距（pt-0.5） */
export const TV_VOD_GRID_TITLE_PAD_TOP_PX = 2;
/** 标题行高（min-h-5 / text-sm） */
export const TV_VOD_GRID_TITLE_META_HEIGHT_PX = 20;

/** @deprecated 旧固定卡宽档位；布局已改为 viewMode 列数 */
export type TvVodCardSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** @deprecated */
export const TV_VOD_CARD_SIZE_LABELS: Record<TvVodCardSize, string> = {
  xs: '极小',
  sm: '小',
  md: '中',
  lg: '大',
  xl: '极大',
};

/** @deprecated */
export const TV_VOD_CARD_SIZES: TvVodCardSize[] = ['xs', 'sm', 'md', 'lg', 'xl'];

/** @deprecated */
export const TV_VOD_CARD_COVER_WIDTH_PX: Record<TvVodCardSize, number> = {
  xs: 72,
  sm: 96,
  md: 120,
  lg: 148,
  xl: 176,
};

/** @deprecated 默认间距参考值 */
export const TV_VOD_COL_GAP_PX = 16;
/** @deprecated */
export const TV_VOD_ROW_GAP_PX = TV_VOD_COL_GAP_PX;

/**
 * 按列宽估算行内容高度（不含行间距）。
 * 对齐 TvVodCard：p-1、gap-1、封面 aspect-2/3（相对内容宽）、标题 pt-0.5+min-h-5、行顶 hover 留白。
 */
export function estimateTvVodGridRowHeightFromColWidth(colWidth: number): number {
  const innerW = Math.max(0, colWidth - TV_VOD_GRID_CARD_PADDING_PX);
  const coverH = Math.round((innerW * 3) / 2);
  return (
    TV_VOD_ROW_HOVER_PAD_PX +
    TV_VOD_GRID_CARD_PADDING_PX +
    coverH +
    TV_VOD_GRID_INNER_GAP_PX +
    TV_VOD_GRID_TITLE_PAD_TOP_PX +
    TV_VOD_GRID_TITLE_META_HEIGHT_PX
  );
}

export function estimateTvVodGridRowHeightPx(metrics: VirtualGridRowLayoutMetrics): number {
  return estimateTvVodGridRowHeightFromColWidth(metrics.colWidth);
}

/** @deprecated */
export function estimateTvMobileVodRowHeightPx(
  metrics: VirtualGridRowLayoutMetrics,
): number {
  return estimateTvVodGridRowHeightPx(metrics);
}

export function tvVodSpacingToGapPx(spacing: number): number {
  return bookshelfLayoutSpacingToPx(spacing);
}

export function tvVodItemKey(
  vod: { siteKey?: string; vod_id: string },
  index: number,
): string {
  return `${vod.siteKey ?? ''}|${vod.vod_id}|${index}`;
}
