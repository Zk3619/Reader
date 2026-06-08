/**
 * 按页双栏 spread 渲染：左右 50% 单栏 pane + translateY 视口切片（无 CSS columns-2 live）
 */

import type { ReaderChapterLayout } from '@/lib/media/text/reader-chapter-layout-types';
import { mergePagedContentTransforms } from '@/lib/media/text/reader-paged-turn-style';

export type { DualSpreadLayoutPick } from '@/lib/media/text/text-viewer-paginate-dual';
export { inferDualSpreadRightStart } from '@/lib/media/text/text-viewer-paginate-dual';

export interface DualSpreadYOffset {
  leftY: number;
  rightY: number;
}

/** 双栏 spread 按页渲染 blocks（translateY=0），pageStarts 仅用于块过滤 */
export function dualSpreadYOffset(
  layout: ReaderChapterLayout | null | undefined,
  pageIndex: number,
): DualSpreadYOffset {
  if (!layout?.dualPage) {
    const y = Math.round(layout?.pageStarts[pageIndex] ?? 0);
    return { leftY: y, rightY: y };
  }
  void pageIndex;
  return { leftY: 0, rightY: 0 };
}

export const READER_PAGED_DUAL_SHIFT_CLASS = 'reader-paged-dual-shift';
export const READER_PAGED_DUAL_PANE_LEFT_CLASS = 'reader-paged-dual-pane-left';
export const READER_PAGED_DUAL_PANE_RIGHT_CLASS = 'reader-paged-dual-pane-right';
export const READER_PAGED_DUAL_SHIFT_RIGHT_CLASS = 'reader-paged-dual-shift-right';

export const READER_PAGED_DUAL_SPREAD_WIDTH_VAR = '--reader-dual-spread-width';
export const READER_PAGED_DUAL_COLUMN_GAP_VAR = '--reader-dual-column-gap';

/** 双栏 spread 容器：中缝 gap 与测量/排版 dualSpreadColumnWidthPx 对齐 */
export function dualSpreadContainerStyle(columnGapPx = 32): Record<string, string> {
  return {
    [READER_PAGED_DUAL_COLUMN_GAP_VAR]: `${Math.max(0, columnGapPx)}px`,
  };
}

/** 单栏 pane 内正文层（栏宽 100%，由 visibleBlockIndices 限定块） */
export function dualSpreadColumnPaneStyle(
  extentPx?: number,
): Record<string, string | undefined> {
  return {
    width: '100%',
    'min-height': extentPx != null && extentPx > 0 ? `${extentPx}px` : undefined,
  };
}

/** @deprecated 兼容旧引用 */
export function dualSpreadShiftLayoutStyle(
  _spreadWidthPx: number,
  _role: 'left' | 'right',
  extentPx?: number,
): Record<string, string | undefined> {
  return dualSpreadColumnPaneStyle(extentPx);
}

export function dualSpreadShiftTransform(
  y: number,
  ...extras: (string | undefined)[]
): string | undefined {
  return mergePagedContentTransforms(y, ...extras);
}

export function applyDualSpreadPageTransforms(
  leftShift: HTMLElement | undefined,
  rightShift: HTMLElement | undefined,
  offsets: DualSpreadYOffset,
  ...extras: (string | undefined)[]
): void {
  if (leftShift) {
    leftShift.style.transform = dualSpreadShiftTransform(offsets.leftY, ...extras) ?? '';
  }
  if (rightShift) {
    rightShift.style.transform = dualSpreadShiftTransform(offsets.rightY, ...extras) ?? '';
  }
}

export function neutralizeDualSpreadTransforms(
  leftShift: HTMLElement | undefined,
  rightShift: HTMLElement | undefined,
): () => void {
  const prevLeft = leftShift?.style.transform ?? '';
  const prevRight = rightShift?.style.transform ?? '';
  if (leftShift) leftShift.style.transform = 'translate3d(0, 0, 0)';
  if (rightShift) rightShift.style.transform = 'translate3d(0, 0, 0)';
  return () => {
    if (leftShift) leftShift.style.transform = prevLeft;
    if (rightShift) rightShift.style.transform = prevRight;
  };
}

export function firstRightColumnSegmentTop(segments: { top: number; column?: 0 | 1 }[]): number {
  const right = segments.filter((s) => (s.column ?? 0) === 1);
  if (right.length === 0) return 0;
  return Math.round(Math.min(...right.map((s) => s.top)));
}
