/**
 * 桌面歌词设置页：px 存储 + rem/px 显示换算
 */

import {
  getRootFontSizePx,
  pxToRem,
  remToPx,
  type MusicFontSizeUnit,
} from '@/lib/media/audio/play-detail-lyric-font';

export const DESKTOP_LYRIC_FONT_PX_MIN = 12;
export const DESKTOP_LYRIC_FONT_PX_MAX = 80;
export const DESKTOP_LYRIC_META_FONT_PX_MIN = 10;
export const DESKTOP_LYRIC_META_FONT_PX_MAX = 48;
export const DESKTOP_LYRIC_LINE_GAP_MIN = 0;
export const DESKTOP_LYRIC_LINE_GAP_MAX = 25;

export function clampDesktopLyricFontPx(px: number): number {
  if (!Number.isFinite(px)) return 20;
  return Math.max(
    DESKTOP_LYRIC_FONT_PX_MIN,
    Math.min(DESKTOP_LYRIC_FONT_PX_MAX, Math.round(px)),
  );
}

export function clampDesktopLyricMetaFontPx(px: number): number {
  if (!Number.isFinite(px)) return 14;
  return Math.max(
    DESKTOP_LYRIC_META_FONT_PX_MIN,
    Math.min(DESKTOP_LYRIC_META_FONT_PX_MAX, Math.round(px)),
  );
}

export function clampDesktopLyricLineGapPx(px: number): number {
  if (!Number.isFinite(px)) return 15;
  return Math.max(
    DESKTOP_LYRIC_LINE_GAP_MIN,
    Math.min(DESKTOP_LYRIC_LINE_GAP_MAX, Math.round(px)),
  );
}

export function formatPxForUnit(
  px: number,
  unit: MusicFontSizeUnit,
  rootPx = getRootFontSizePx(),
): number {
  if (unit === 'rem') {
    return Math.round(pxToRem(px, rootPx) * 1000) / 1000;
  }
  return Math.round(px * 10) / 10;
}

export function displayToPx(
  display: number,
  unit: MusicFontSizeUnit,
  rootPx = getRootFontSizePx(),
): number {
  if (!Number.isFinite(display)) return 0;
  return unit === 'rem' ? remToPx(display, rootPx) : display;
}

export function pxConversionHint(
  px: number,
  unit: MusicFontSizeUnit,
  rootPx = getRootFontSizePx(),
): string {
  if (unit === 'rem') {
    return `约 ${remToPx(pxToRem(px, rootPx), rootPx).toFixed(1)}px（当前根字号 ${rootPx}px，1rem = ${rootPx}px）`;
  }
  return `约 ${pxToRem(px, rootPx).toFixed(3)}rem（当前根字号 ${rootPx}px，1rem = ${rootPx}px）`;
}
