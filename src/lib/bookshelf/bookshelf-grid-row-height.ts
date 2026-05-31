/**
 * 书架网格虚拟行高估算（与 bookGroupGridCoverClass aspect-3/4、p-2、gap-1.5 对齐）
 * 供 VirtualGridRowsList rowHeightMode="responsive" 接入书架页时使用。
 */

import type { VirtualGridRowLayoutMetrics } from '@/components/shared/virtual-list/virtual-grid-row-layout';

export interface BookshelfGridRowHeightOptions {
  /** 封面下展示书名/作者文字区（非 overlay 时） */
  showSubtitle?: boolean;
  /** 书名叠在封面上时不占行内文字区 */
  titleOverlay?: boolean;
  /** 虚拟行额外上下留白（px）；行容器使用 px-1 时默认 0，由 VirtualList listInnerClass 提供整体 p-1 */
  rowPaddingY?: number;
}

const GRID_CARD_PAD_Y = 16;
const GRID_INNER_GAP = 6;
const GRID_TITLE_LINE = 20;
const GRID_SUBTITLE_LINE = 16;
const COVER_ASPECT_H_OVER_W = 4 / 3;

/** 根据列宽估算单张卡片占用高度（不含网格 gap，行间距由 CSS gap / margin 承担） */
export function estimateBookshelfGridCardHeight(
  metrics: VirtualGridRowLayoutMetrics,
  options?: BookshelfGridRowHeightOptions,
): number {
  const coverH = metrics.colWidth * COVER_ASPECT_H_OVER_W;
  const titleH = options?.titleOverlay ? 0 : GRID_TITLE_LINE;
  const subtitleH = options?.showSubtitle ? GRID_SUBTITLE_LINE : 0;
  const cardH = GRID_CARD_PAD_Y + coverH + GRID_INNER_GAP + titleH + subtitleH;
  const rowPad = options?.rowPaddingY ?? 0;
  return cardH + rowPad;
}

