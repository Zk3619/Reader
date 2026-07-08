/**
 * 语义色 token 编辑辅助
 */

import type { SemanticColorTokens } from '@/lib/theme/types';
import { SEMANTIC_TO_CSS_VAR } from '@/lib/theme/tokens';

export interface SemanticTokenGroup {
  id: string;
  label: string;
  keys: (keyof SemanticColorTokens)[];
}

export const SEMANTIC_TOKEN_GROUPS: SemanticTokenGroup[] = [
  {
    id: 'surface',
    label: '表面',
    keys: ['background', 'foreground', 'card', 'cardForeground', 'muted', 'mutedForeground'],
  },
  {
    id: 'brand',
    label: '品牌',
    keys: ['primary', 'primaryForeground', 'secondary', 'secondaryForeground', 'accent', 'accentForeground'],
  },
  {
    id: 'feedback',
    label: '反馈',
    keys: [
      'destructive',
      'destructiveForeground',
      'info',
      'infoForeground',
      'success',
      'successForeground',
      'warning',
      'warningForeground',
      'error',
      'errorForeground',
    ],
  },
  {
    id: 'chrome',
    label: '边框与导航',
    keys: ['border', 'input', 'ring', 'popover', 'popoverForeground'],
  },
  {
    id: 'sidebar',
    label: '侧边栏',
    keys: [
      'sidebar',
      'sidebarForeground',
      'sidebarAccent',
      'sidebarAccentForeground',
      'sidebarBorder',
      'sidebarRing',
    ],
  },
];

export const SEMANTIC_TOKEN_LABELS: Record<keyof SemanticColorTokens, string> = {
  background: '背景',
  foreground: '前景',
  muted: '弱化背景',
  mutedForeground: '弱化文字',
  popover: '弹出层背景',
  popoverForeground: '弹出层文字',
  border: '边框',
  input: '输入框边框',
  card: '卡片背景',
  cardForeground: '卡片文字',
  primary: '主色',
  primaryForeground: '主色文字',
  secondary: '次要色',
  secondaryForeground: '次要色文字',
  accent: '强调色',
  accentForeground: '强调色文字',
  destructive: '危险色',
  destructiveForeground: '危险色文字',
  info: '信息色',
  infoForeground: '信息色文字',
  success: '成功色',
  successForeground: '成功色文字',
  warning: '警告色',
  warningForeground: '警告色文字',
  error: '错误色',
  errorForeground: '错误色文字',
  ring: '焦点环',
  sidebar: '侧栏背景',
  sidebarForeground: '侧栏文字',
  sidebarAccent: '侧栏强调',
  sidebarAccentForeground: '侧栏强调文字',
  sidebarBorder: '侧栏边框',
  sidebarRing: '侧栏焦点环',
};

/** HSL 分量 → #hex（近似，用于 color input） */
export function hslComponentsToHex(hsl: string): string {
  const parts = hsl.trim().split(/\s+/);
  if (parts.length < 3) return '#888888';
  const h = parseFloat(parts[0] ?? '0');
  const s = parseFloat((parts[1] ?? '0').replace('%', '')) / 100;
  const l = parseFloat((parts[2] ?? '0').replace('%', '')) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** #hex → HSL 分量字符串 */
export function hexToHslComponents(hex: string): string {
  const raw = hex.replace(/^#/, '');
  if (raw.length !== 6) return '0 0% 50%';
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return `0 0% ${Math.round(l * 100)}%`;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function cssVarForSemanticKey(key: keyof SemanticColorTokens): string {
  return SEMANTIC_TO_CSS_VAR[key] ?? `--${key}`;
}
