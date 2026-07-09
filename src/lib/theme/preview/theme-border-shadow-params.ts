/**
 * 组件边框 / 阴影 — 参数化解析与序列化
 */

export type ThemeBorderMode = 'inherit' | 'none' | 'custom';
export type ThemeShadowMode = 'inherit' | 'none' | 'custom';
export type ThemeBorderStyle = 'solid' | 'dashed' | 'dotted';
export type ThemeBorderColorToken = 'border' | 'primary' | 'accent' | 'foreground';

export interface ParsedThemeBorder {
  mode: ThemeBorderMode;
  width: number;
  style: ThemeBorderStyle;
  colorToken: ThemeBorderColorToken;
}

export interface ParsedThemeShadow {
  mode: ThemeShadowMode;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  opacity: number;
}

const BORDER_COLOR_PATTERN =
  /^(?<width>\d+(?:\.\d+)?)px\s+(?<style>solid|dashed|dotted)\s+hsl\(var\(--(?<token>border|primary|accent|foreground)\)\)$/i;

const SHADOW_PATTERN =
  /^(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px(?:\s+(-?\d+(?:\.\d+)?)px)?\s+rgba\(0,\s*0,\s*0,\s*([\d.]+)\)$/;

export function parseThemeBorder(value: string | undefined): ParsedThemeBorder {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return { mode: 'inherit', width: 1, style: 'solid', colorToken: 'border' };
  }
  if (trimmed === 'none') {
    return { mode: 'none', width: 1, style: 'solid', colorToken: 'border' };
  }
  const match = trimmed.match(BORDER_COLOR_PATTERN);
  if (match?.groups) {
    return {
      mode: 'custom',
      width: Number(match.groups.width) || 1,
      style: (match.groups.style as ThemeBorderStyle) ?? 'solid',
      colorToken: (match.groups.token as ThemeBorderColorToken) ?? 'border',
    };
  }
  return { mode: 'custom', width: 1, style: 'solid', colorToken: 'border' };
}

export function formatThemeBorder(parsed: ParsedThemeBorder): string {
  if (parsed.mode === 'inherit') return '';
  if (parsed.mode === 'none') return 'none';
  const width = Math.max(0, Math.round(parsed.width * 1000) / 1000);
  return `${width}px ${parsed.style} hsl(var(--${parsed.colorToken}))`;
}

export function parseThemeShadow(value: string | undefined): ParsedThemeShadow {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return { mode: 'inherit', offsetX: 0, offsetY: 4, blur: 12, spread: 0, opacity: 12 };
  }
  if (trimmed === 'none') {
    return { mode: 'none', offsetX: 0, offsetY: 0, blur: 0, spread: 0, opacity: 0 };
  }
  const match = trimmed.match(SHADOW_PATTERN);
  if (match) {
    return {
      mode: 'custom',
      offsetX: Number(match[1]) || 0,
      offsetY: Number(match[2]) || 0,
      blur: Number(match[3]) || 0,
      spread: Number(match[4] ?? 0) || 0,
      opacity: Math.round(Number(match[5] ?? 0.12) * 100),
    };
  }
  return { mode: 'custom', offsetX: 0, offsetY: 4, blur: 12, spread: 0, opacity: 12 };
}

export function formatThemeShadow(parsed: ParsedThemeShadow): string {
  if (parsed.mode === 'inherit') return '';
  if (parsed.mode === 'none') return 'none';
  const alpha = Math.min(100, Math.max(0, parsed.opacity)) / 100;
  const ox = Math.round(parsed.offsetX);
  const oy = Math.round(parsed.offsetY);
  const blur = Math.max(0, Math.round(parsed.blur));
  const spread = Math.round(parsed.spread);
  const spreadPart = spread !== 0 ? ` ${spread}px` : '';
  return `${ox}px ${oy}px ${blur}px${spreadPart} rgba(0, 0, 0, ${alpha})`;
}

export const THEME_BORDER_COLOR_OPTIONS: { value: ThemeBorderColorToken; label: string }[] = [
  { value: 'border', label: '默认边框色' },
  { value: 'primary', label: '主色' },
  { value: 'accent', label: '强调色' },
  { value: 'foreground', label: '前景色' },
];

export const THEME_BORDER_STYLE_OPTIONS: { value: ThemeBorderStyle; label: string }[] = [
  { value: 'solid', label: '实线' },
  { value: 'dashed', label: '虚线' },
  { value: 'dotted', label: '点线' },
];

export const THEME_BORDER_MODE_OPTIONS: { value: ThemeBorderMode; label: string }[] = [
  { value: 'inherit', label: '继承' },
  { value: 'none', label: '无边框' },
  { value: 'custom', label: '自定义' },
];

export const THEME_SHADOW_MODE_OPTIONS: { value: ThemeShadowMode; label: string }[] = [
  { value: 'inherit', label: '继承' },
  { value: 'none', label: '无阴影' },
  { value: 'custom', label: '自定义' },
];
