/**
 * 轻量 WCAG 对比度计算（无外部依赖）
 */

import { hexToRgb, relativeLuminance } from '@/lib/theme/color-utils';
import { hslComponentsToHex } from '@/lib/theme/theme-semantic-colors';

export type ContrastLevel = 'AA' | 'AAA' | 'relaxed';

const LEVEL_THRESHOLDS: Record<ContrastLevel, number> = {
  AA: 4.5,
  AAA: 7,
  relaxed: 3,
};

/** 任意 #hex 或 HSL 分量字符串 → #hex */
export function colorToHex(color: string): string {
  const trimmed = color.trim();
  if (trimmed.startsWith('#')) return trimmed;
  return hslComponentsToHex(trimmed);
}

/** WCAG 2.x 对比度比值 */
export function contrastRatio(foreground: string, background: string): number {
  const fg = relativeLuminance(colorToHex(foreground));
  const bg = relativeLuminance(colorToHex(background));
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsContrast(
  foreground: string,
  background: string,
  level: ContrastLevel = 'AA',
): boolean {
  return contrastRatio(foreground, background) >= LEVEL_THRESHOLDS[level];
}

export function requiredContrastRatio(level: ContrastLevel): number {
  return LEVEL_THRESHOLDS[level];
}

/** 在背景色上调整前景亮度直至达标 */
export function adjustForegroundForContrast(
  foregroundHex: string,
  backgroundHex: string,
  level: ContrastLevel = 'AA',
): string {
  const target = LEVEL_THRESHOLDS[level];
  if (contrastRatio(foregroundHex, backgroundHex) >= target) {
    return foregroundHex;
  }

  const bgLum = relativeLuminance(backgroundHex);
  const preferLight = bgLum < 0.5;
  const { r, g, b } = hexToRgb(foregroundHex);

  for (let step = 1; step <= 40; step++) {
    const factor = preferLight ? step / 40 : 1 - step / 40;
    const nr = Math.round(r * factor + (preferLight ? 255 : 0) * (1 - factor));
    const ng = Math.round(g * factor + (preferLight ? 255 : 0) * (1 - factor));
    const nb = Math.round(b * factor + (preferLight ? 255 : 0) * (1 - factor));
    const candidate = `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
    if (contrastRatio(candidate, backgroundHex) >= target) {
      return candidate;
    }
  }

  return preferLight ? '#ffffff' : '#000000';
}
