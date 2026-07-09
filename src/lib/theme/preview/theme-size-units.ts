/**
 * 主题工作室 — 尺寸单位（默认 rem，可切换 px，存储为带单位字符串）
 */

export const THEME_SIZE_ROOT_PX = 16;

export type ThemeSizeUnit = 'rem' | 'px';

const LENGTH_VALUE_PATTERN = /^(-?\d*\.?\d+)(px|rem|em)?$/;
const PERCENT_VALUE_PATTERN = /^(-?\d*\.?\d+)%$/;

export interface ParsedThemeLength {
  value: number;
  unit: ThemeSizeUnit;
}

export function parseThemeLength(raw: string): ParsedThemeLength | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(LENGTH_VALUE_PATTERN);
  if (!match) return null;
  const value = parseFloat(match[1] ?? '0');
  if (!Number.isFinite(value)) return null;
  const unit = (match[2] as ThemeSizeUnit | 'em' | undefined) ?? 'rem';
  if (unit === 'em') return { value, unit: 'rem' };
  return { value, unit };
}

export function formatThemeLength(value: number, unit: ThemeSizeUnit): string {
  const rounded = Math.round(value * 1000) / 1000;
  return `${rounded}${unit}`;
}

export function remToPx(rem: number, rootPx = THEME_SIZE_ROOT_PX): number {
  return rem * rootPx;
}

export function pxToRem(px: number, rootPx = THEME_SIZE_ROOT_PX): number {
  return px / rootPx;
}

/** 展示用：rem ↔ px 对照 */
export function themeLengthConversionHint(raw: string, rootPx = THEME_SIZE_ROOT_PX): string | undefined {
  const parsed = parseThemeLength(raw);
  if (!parsed) return undefined;
  if (parsed.unit === 'rem') {
    return `${parsed.value} rem ≈ ${Math.round(remToPx(parsed.value, rootPx))} px`;
  }
  return `${parsed.value} px ≈ ${(pxToRem(parsed.value, rootPx)).toFixed(3)} rem`;
}

export function parseThemePercent(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(PERCENT_VALUE_PATTERN);
  if (!match) return null;
  const value = parseFloat(match[1] ?? '0');
  return Number.isFinite(value) ? value : null;
}

export function formatThemePercent(value: number): string {
  return `${Math.round(value * 1000) / 1000}%`;
}

export function themeLengthToPreviewPx(raw: string, rootPx = THEME_SIZE_ROOT_PX): number | undefined {
  const parsed = parseThemeLength(raw);
  if (!parsed) return undefined;
  const px = parsed.unit === 'rem' ? remToPx(parsed.value, rootPx) : parsed.value;
  return Math.min(Math.max(Math.round(px), 4), 320);
}
