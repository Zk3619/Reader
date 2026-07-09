/**
 * 主题工作室 — 动效参数预设（避免手写 cubic-bezier / ms 字符串）
 */

export interface ThemeEasingPreset {
  id: string;
  label: string;
  value: string;
}

export const THEME_EASING_PRESETS: ThemeEasingPreset[] = [
  { id: 'linear', label: '匀速 linear', value: 'linear' },
  { id: 'ease', label: '标准 ease', value: 'ease' },
  { id: 'ease-in', label: '缓入 ease-in', value: 'ease-in' },
  { id: 'ease-out', label: '缓出 ease-out', value: 'ease-out' },
  { id: 'ease-in-out', label: '缓入缓出 ease-in-out', value: 'ease-in-out' },
  {
    id: 'reader-bar-enter',
    label: '阅读顶栏进入（默认）',
    value: 'cubic-bezier(0.22, 1, 0.36, 1)',
  },
  {
    id: 'reader-bar-exit',
    label: '阅读顶栏退出（默认）',
    value: 'cubic-bezier(0.64, 0, 0.78, 0)',
  },
  {
    id: 'emphasized-decelerate',
    label: '强调减速',
    value: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  },
  {
    id: 'emphasized-accelerate',
    label: '强调加速',
    value: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
  },
];

export function resolveEasingPresetId(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';
  const hit = THEME_EASING_PRESETS.find((p) => p.value === trimmed);
  return hit?.id ?? 'custom';
}

export function easingPresetValue(id: string): string | undefined {
  if (!id || id === 'custom') return undefined;
  return THEME_EASING_PRESETS.find((p) => p.id === id)?.value;
}

const TIME_VALUE_PATTERN = /^(-?\d*\.?\d+)(ms|s)?$/;

export function parseThemeDurationMs(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(TIME_VALUE_PATTERN);
  if (!match) return null;
  const num = parseFloat(match[1] ?? '0');
  if (!Number.isFinite(num)) return null;
  const unit = match[2] ?? 'ms';
  return unit === 's' ? num * 1000 : num;
}

export function formatThemeDurationMs(ms: number): string {
  if (ms >= 1000 && ms % 100 === 0) {
    return `${ms / 1000}s`;
  }
  return `${Math.round(ms)}ms`;
}

export const THEME_DURATION_PRESETS_MS = [
  { label: '120ms 极快', value: 120 },
  { label: '200ms 常规', value: 200 },
  { label: '300ms 适中', value: 300 },
  { label: '400ms 阅读顶栏', value: 400 },
  { label: '600ms 慢', value: 600 },
  { label: '2600ms 搜索循环', value: 2600 },
] as const;
