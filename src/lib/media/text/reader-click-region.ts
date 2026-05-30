/**
 * 九宫格点击区域分界（比例 0–1，对齐 Legado ReadView.setRect9x 的可调边界）
 *
 * 阅读时：`ReaderPage` 在正文 scrollContainer（absolute inset-0）上取点击坐标，
 * 用 xRatio/yRatio 与本模块的 xSplits/ySplits 解析区域，映射整块阅读器正文视口。
 * 配置层九宫格同样按 absolute inset-0 铺满，所见即所得。
 */

import type { ReaderClickZone } from '@/lib/media/text/reader-click-actions';

export interface ReaderClickRegion {
  /** 竖向两条分界线的 x 比例（左→右递增） */
  xSplits: [number, number];
  /** 横向两条分界线的 y 比例（上→下递增） */
  ySplits: [number, number];
}

export const DEFAULT_CLICK_REGION: ReaderClickRegion = {
  xSplits: [1 / 3, 2 / 3],
  ySplits: [1 / 3, 2 / 3],
};

const MIN_CELL = 0.08;
const MIN_SPLIT_GAP = 0.04;

function clampSplitPair(
  a: number,
  b: number,
): [number, number] {
  let x1 = Math.max(MIN_CELL, Math.min(1 - MIN_CELL * 2 - MIN_SPLIT_GAP, a));
  let x2 = Math.max(x1 + MIN_SPLIT_GAP, Math.min(1 - MIN_CELL, b));
  if (x2 - x1 < MIN_SPLIT_GAP) {
    x2 = x1 + MIN_SPLIT_GAP;
  }
  if (x2 > 1 - MIN_CELL) {
    x2 = 1 - MIN_CELL;
    x1 = Math.min(x1, x2 - MIN_SPLIT_GAP);
  }
  return [x1, x2];
}

export function clampClickRegion(region: ReaderClickRegion): ReaderClickRegion {
  const [x1, x2] = clampSplitPair(region.xSplits[0], region.xSplits[1]);
  const [y1, y2] = clampSplitPair(region.ySplits[0], region.ySplits[1]);
  return { xSplits: [x1, x2], ySplits: [y1, y2] };
}

export function resolveClickZone(
  xRatio: number,
  yRatio: number,
  region: ReaderClickRegion = DEFAULT_CLICK_REGION,
): ReaderClickZone {
  const { xSplits, ySplits } = clampClickRegion(region);
  const col = xRatio < xSplits[0] ? 'l' : xRatio < xSplits[1] ? 'c' : 'r';
  const row = yRatio < ySplits[0] ? 't' : yRatio < ySplits[1] ? 'm' : 'b';
  return `${row}${col}` as ReaderClickZone;
}

export type ZoneRectRatio = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function getZoneRectRatio(
  zone: ReaderClickZone,
  region: ReaderClickRegion,
): ZoneRectRatio {
  const { xSplits, ySplits } = clampClickRegion(region);
  const [x1, x2] = xSplits;
  const [y1, y2] = ySplits;
  switch (zone) {
    case 'tl':
      return { left: 0, top: 0, width: x1, height: y1 };
    case 'tc':
      return { left: x1, top: 0, width: x2 - x1, height: y1 };
    case 'tr':
      return { left: x2, top: 0, width: 1 - x2, height: y1 };
    case 'ml':
      return { left: 0, top: y1, width: x1, height: y2 - y1 };
    case 'mc':
      return { left: x1, top: y1, width: x2 - x1, height: y2 - y1 };
    case 'mr':
      return { left: x2, top: y1, width: 1 - x2, height: y2 - y1 };
    case 'bl':
      return { left: 0, top: y2, width: x1, height: 1 - y2 };
    case 'bc':
      return { left: x1, top: y2, width: x2 - x1, height: 1 - y2 };
    case 'br':
      return { left: x2, top: y2, width: 1 - x2, height: 1 - y2 };
  }
}

export type ClickRegionDivider = 'v1' | 'v2' | 'h1' | 'h2';

export function applyDividerDrag(
  region: ReaderClickRegion,
  divider: ClickRegionDivider,
  ratio: number,
): ReaderClickRegion {
  const next = { ...region, xSplits: [...region.xSplits] as [number, number], ySplits: [...region.ySplits] as [number, number] };
  const r = Math.max(0, Math.min(1, ratio));
  if (divider === 'v1') next.xSplits[0] = r;
  if (divider === 'v2') next.xSplits[1] = r;
  if (divider === 'h1') next.ySplits[0] = r;
  if (divider === 'h2') next.ySplits[1] = r;
  return clampClickRegion(next);
}
