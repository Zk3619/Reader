/**
 * 主题工作室 — 组件边框/阴影快捷预设
 */

export interface ThemeStylePreset {
  label: string;
  value: string;
}

export const THEME_BORDER_PRESETS: ThemeStylePreset[] = [
  { label: '继承（不覆盖）', value: '' },
  { label: '无边框', value: 'none' },
  { label: '1px 默认边框', value: '1px solid hsl(var(--border))' },
  { label: '1px 主色边框', value: '1px solid hsl(var(--primary))' },
  { label: '2px 强调边框', value: '2px solid hsl(var(--primary))' },
];

export const THEME_SHADOW_PRESETS: ThemeStylePreset[] = [
  { label: '继承（不覆盖）', value: '' },
  { label: '无阴影', value: 'none' },
  { label: '小阴影', value: '0 1px 3px rgba(0,0,0,0.12)' },
  { label: '中阴影', value: '0 4px 12px rgba(0,0,0,0.12)' },
  { label: '大阴影', value: '0 8px 24px rgba(0,0,0,0.16)' },
];

export const THEME_FONT_WEIGHT_OPTIONS = [
  { label: '常规 400', value: '400' },
  { label: '中等 500', value: '500' },
  { label: '半粗 600', value: '600' },
  { label: '粗体 700', value: '700' },
] as const;

export function resolveStylePresetId(
  presets: ThemeStylePreset[],
  value: string | undefined,
): string {
  const trimmed = value?.trim() ?? '';
  const hit = presets.find((p) => p.value === trimmed);
  if (hit) return hit.value;
  return trimmed ? '__custom__' : '';
}
