/** 颜色工具：hex / rgba / 相对亮度 */

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function rgbaHex(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const linear = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

export function isDarkHexBackground(hex: string): boolean {
  return relativeLuminance(hex) < 0.45;
}

/** 由 bg / text / border 派生亮度胶囊配色 */
export function deriveBrightnessChrome(
  bg: string,
  text: string,
  border: string,
): import('@/lib/theme/types').BrightnessChromeTokens {
  const darkBg = isDarkHexBackground(bg);
  const trackAlpha = darkBg ? 0.32 : 0.26;
  const fillAlpha = darkBg ? 0.9 : 0.8;
  const glowStrength = darkBg ? 0.58 : 0.48;

  return {
    capsuleBg: bg,
    foreground: text,
    buttonHoverBg: rgbaHex(text, darkBg ? 0.14 : 0.1),
    sliderTrack: rgbaHex(text, trackAlpha),
    sliderFill: rgbaHex(text, fillAlpha),
    sliderThumb: text,
    capsuleGlow: `0 0 0 1px ${rgbaHex(border, 0.42)}, 0 0 16px ${rgbaHex(border, glowStrength)}, 0 0 6px ${rgbaHex(text, 0.18)}`,
  };
}

export function contentPaletteStyle(palette: Pick<import('@/lib/theme/types').HexContentPalette, 'bg' | 'text'>): {
  'background-color': string;
  color: string;
} {
  return {
    'background-color': palette.bg,
    color: palette.text,
  };
}
