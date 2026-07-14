/**
 * 音乐歌单列表布局：对齐 lx-music-desktop 卡片尺寸与响应式列数
 */

import type { VirtualGridRowLayoutMetrics } from '@/components/shared/virtual-list';

/** lx 歌单卡片最小宽度 */
export const LX_PLAYLIST_CARD_MIN_WIDTH_PX = 240;

/** lx 歌单卡片最大宽度 */
export const LX_PLAYLIST_CARD_MAX_WIDTH_PX = 360;

/** 封面占卡片宽度比例（lx：40%，正方形） */
export const LX_PLAYLIST_COVER_WIDTH_RATIO = 0.4;

/** 桌面列间距（Tailwind gap-x-5） */
export const LX_PLAYLIST_DESKTOP_COL_GAP_PX = 20;

/** 桌面行间距：与列间距一致 */
export const LX_PLAYLIST_DESKTOP_ROW_GAP_PX = LX_PLAYLIST_DESKTOP_COL_GAP_PX;

/** 行顶留白：容纳悬停 translateY(-2px) 与阴影，避免被虚拟行裁切 */
export const LX_PLAYLIST_ROW_HOVER_PAD_PX = 4;

/** 列表水平内边距合计（与 listInnerClass px-2 一致） */
export const LX_PLAYLIST_LIST_HORIZONTAL_PADDING_PX = 16;

/** 移动列间距（Tailwind gap-x-6） */
export const LX_PLAYLIST_MOBILE_COL_GAP_PX = 24;

/** 移动行间距：与列间距一致 */
export const LX_PLAYLIST_MOBILE_ROW_GAP_PX = LX_PLAYLIST_MOBILE_COL_GAP_PX;

/** 移动网格卡内边距合计（bookGroupGridCardClass p-1 × 2） */
export const LX_PLAYLIST_MOBILE_CARD_PADDING_PX = 8;

/** 移动网格 meta 区高度（对齐 bookGroupGridMetaClass min-h-9） */
export const LX_PLAYLIST_MOBILE_META_HEIGHT_PX = 36;

/** 桌面横向卡内边距（Tailwind p-2，四周 8px） */
export const LX_PLAYLIST_DESKTOP_CARD_PADDING_PX = 8;

const LX_PLAYLIST_DESKTOP_CARD_INSET_PX = LX_PLAYLIST_DESKTOP_CARD_PADDING_PX * 2;

export function lxPlaylistCardWidthPx(colWidth: number): number {
  return Math.min(
    LX_PLAYLIST_CARD_MAX_WIDTH_PX,
    Math.max(LX_PLAYLIST_CARD_MIN_WIDTH_PX, colWidth),
  );
}

/** 卡片高度：封面区（内宽 40% 正方形）+ 上下内边距 */
export function lxPlaylistCardHeightPx(cardWidth: number): number {
  const innerWidth = Math.max(0, cardWidth - LX_PLAYLIST_DESKTOP_CARD_INSET_PX);
  const coverSide = Math.round(innerWidth * LX_PLAYLIST_COVER_WIDTH_RATIO);
  return coverSide + LX_PLAYLIST_DESKTOP_CARD_INSET_PX;
}

export function estimateLxDesktopPlaylistRowHeightPx(metrics: VirtualGridRowLayoutMetrics): number {
  const cardWidth = lxPlaylistCardWidthPx(metrics.colWidth);
  return lxPlaylistCardHeightPx(cardWidth) + LX_PLAYLIST_ROW_HOVER_PAD_PX;
}

export function estimateLxMobilePlaylistRowHeightPx(metrics: VirtualGridRowLayoutMetrics): number {
  return (
    metrics.colWidth +
    LX_PLAYLIST_MOBILE_CARD_PADDING_PX +
    LX_PLAYLIST_MOBILE_META_HEIGHT_PX +
    LX_PLAYLIST_ROW_HOVER_PAD_PX
  );
}

/**
 * 桌面响应式列数：以 240px 为最小卡片宽、360px 为最大卡片宽推算可容纳列数
 */
export function resolveDesktopPlaylistColumnCount(
  containerWidth: number,
  gapPx: number,
  horizontalPaddingPx: number,
): number {
  const inner = Math.max(0, containerWidth - horizontalPaddingPx);
  if (inner < LX_PLAYLIST_CARD_MIN_WIDTH_PX) return 1;

  const maxCols = Math.max(
    1,
    Math.floor((inner + gapPx) / (LX_PLAYLIST_CARD_MIN_WIDTH_PX + gapPx)),
  );

  let best = 1;
  for (let cols = 1; cols <= maxCols; cols++) {
    const colWidth = (inner - gapPx * (cols - 1)) / cols;
    if (colWidth >= LX_PLAYLIST_CARD_MIN_WIDTH_PX) best = cols;
  }
  return best;
}

/** 移动网格列数：2 / 3 / 4 列断点 */
export function resolveMobilePlaylistColumnCount(windowWidth: number): number {
  if (windowWidth >= 768) return 4;
  if (windowWidth >= 480) return 3;
  return 2;
}

export function musicPlaylistItemKey(
  playlist: { source: string; id: string },
  index: number,
): string {
  return `${playlist.source}|${playlist.id}|${index}`;
}
