/**
 * 播放详情歌词字号：内部以 rem 存储，UI 可切换 rem / px 显示。
 */

export type MusicFontSizeUnit = 'rem' | 'px';

/** 约等于旧版 12–32px @ 16px 根字号 */
export const PLAY_DETAIL_LYRIC_FONT_REM_MIN = 0.75;
export const PLAY_DETAIL_LYRIC_FONT_REM_MAX = 2;
/** 旧版默认 14px @ 16px */
export const PLAY_DETAIL_LYRIC_FONT_REM_DEFAULT = 0.875;

export function getRootFontSizePx(): number {
  if (typeof document === 'undefined') return 16;
  try {
    const n = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return Number.isFinite(n) && n > 0 ? n : 16;
  } catch {
    return 16;
  }
}

export function clampPlayDetailLyricFontRem(rem: number): number {
  if (!Number.isFinite(rem)) return PLAY_DETAIL_LYRIC_FONT_REM_DEFAULT;
  return Math.max(
    PLAY_DETAIL_LYRIC_FONT_REM_MIN,
    Math.min(PLAY_DETAIL_LYRIC_FONT_REM_MAX, rem),
  );
}

export function remToPx(rem: number, rootPx = getRootFontSizePx()): number {
  return rem * rootPx;
}

export function pxToRem(px: number, rootPx = getRootFontSizePx()): number {
  return px / rootPx;
}

/** 将可能是旧版 px（≥8）的值归一为 rem */
export function migratePlayDetailLyricFontSizeToRem(value: number): number {
  if (!Number.isFinite(value)) return PLAY_DETAIL_LYRIC_FONT_REM_DEFAULT;
  if (value >= 8) {
    return clampPlayDetailLyricFontRem(value / 16);
  }
  return clampPlayDetailLyricFontRem(value);
}

export function formatFontSizeForUnit(
  rem: number,
  unit: MusicFontSizeUnit,
  rootPx = getRootFontSizePx(),
): number {
  if (unit === 'px') {
    return Math.round(remToPx(rem, rootPx) * 10) / 10;
  }
  return Math.round(rem * 1000) / 1000;
}

export function displayValueToRem(
  display: number,
  unit: MusicFontSizeUnit,
  rootPx = getRootFontSizePx(),
): number {
  if (unit === 'px') return clampPlayDetailLyricFontRem(pxToRem(display, rootPx));
  return clampPlayDetailLyricFontRem(display);
}

export function fontSizeConversionHint(
  rem: number,
  unit: MusicFontSizeUnit,
  rootPx = getRootFontSizePx(),
): string {
  if (unit === 'rem') {
    return `约 ${remToPx(rem, rootPx).toFixed(1)}px（当前根字号 ${rootPx}px，1rem = ${rootPx}px）`;
  }
  return `约 ${rem.toFixed(3)}rem（当前根字号 ${rootPx}px，1rem = ${rootPx}px）`;
}
