/**
 * 书架列表 / 紧凑列表虚拟行高（对齐 h-28 / h-18）
 */

import { bookshelfLayoutSpacingToPx } from '@/lib/bookshelf/bookshelf-layout-gap';
import type { BookshelfLayoutSettings } from '@/lib/bookshelf/bookshelf-layout-settings';

/** 标准列表行 `h-28` */
export const BOOKSHELF_LIST_ROW_HEIGHT_PX = 112;

/** 紧凑列表行 `h-18` */
export const BOOKSHELF_COMPACT_LIST_ROW_HEIGHT_PX = 72;

export function getBookshelfListRowHeightPx(layout: 'list' | 'compact'): number {
  return layout === 'compact'
    ? BOOKSHELF_COMPACT_LIST_ROW_HEIGHT_PX
    : BOOKSHELF_LIST_ROW_HEIGHT_PX;
}

/** 单列虚拟行槽：卡片高 + 行间距（末行无间距） */
export function estimateBookshelfListVirtualRowSize(
  index: number,
  total: number,
  cardHeightPx: number,
  spacing: BookshelfLayoutSettings['spacing'],
): number {
  const gapPx = bookshelfLayoutSpacingToPx(spacing);
  const last = index >= total - 1;
  return cardHeightPx + (last ? 0 : gapPx);
}

/** 多列网格虚拟行槽（与 VirtualGridRowsList + rowGapCssVar 一致） */
export function estimateBookshelfListGridRowSlotPx(
  rowIndex: number,
  rowCount: number,
  cardHeightPx: number,
  spacing: BookshelfLayoutSettings['spacing'],
): number {
  return estimateBookshelfListVirtualRowSize(rowIndex, rowCount, cardHeightPx, spacing);
}
