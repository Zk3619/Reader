/**
 * Legado themeConfig.json → ReaderThemePackV1 适配
 */

import { DEFAULT_APP_THEME } from '@/lib/theme/AppTheme';
import type { ReaderThemePackV1 } from '@/lib/theme/schema/theme-pack-v1';
import { createThemePackId, touchThemePack } from '@/lib/theme/schema/theme-pack-v1';
import type { SemanticColorTokens } from '@/lib/theme/types';

/** Legado 壳层主题条目 */
export interface LegadoThemeConfigEntry {
  themeName: string;
  isNightTheme: boolean;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  bottomBackground: string;
}

function hexToHslComponents(hex: string): string | null {
  const raw = hex.replace(/^#/, '').trim();
  if (raw.length !== 6 && raw.length !== 8) return null;
  const slice = raw.length === 8 ? raw.slice(2) : raw;
  const r = parseInt(slice.slice(0, 2), 16) / 255;
  const g = parseInt(slice.slice(2, 4), 16) / 255;
  const b = parseInt(slice.slice(4, 6), 16) / 255;
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

function legadoColorToHsl(
  hex: string,
  fallback: SemanticColorTokens[keyof SemanticColorTokens],
): SemanticColorTokens[keyof SemanticColorTokens] {
  return (hexToHslComponents(hex) ?? fallback) as SemanticColorTokens[keyof SemanticColorTokens];
}

function buildSemanticFromLegado(entry: LegadoThemeConfigEntry): SemanticColorTokens {
  const base = DEFAULT_APP_THEME.light;
  return {
    ...base,
    background: legadoColorToHsl(entry.backgroundColor, base.background),
    foreground: legadoColorToHsl(entry.primaryColor, base.foreground),
    primary: legadoColorToHsl(entry.accentColor, base.primary),
    card: legadoColorToHsl(entry.backgroundColor, base.card),
    muted: legadoColorToHsl(entry.bottomBackground, base.muted),
    border: legadoColorToHsl(entry.bottomBackground, base.border),
    sidebar: legadoColorToHsl(entry.bottomBackground, base.sidebar),
  };
}

/** 单条 Legado 主题 → Theme Pack（仅 app 段） */
export function legadoThemeEntryToPack(entry: LegadoThemeConfigEntry): ReaderThemePackV1 {
  const now = new Date().toISOString();
  const semantic = buildSemanticFromLegado(entry);
  const pack: ReaderThemePackV1 = {
    schemaVersion: 1,
    id: createThemePackId(),
    name: entry.themeName,
    createdAt: now,
    updatedAt: now,
    scopes: { app: true, viewer: false },
    app: {
      mode: entry.isNightTheme ? 'dark' : 'light',
      tokens: {
        id: `legado-${entry.themeName}`,
        name: entry.themeName,
        light: entry.isNightTheme ? DEFAULT_APP_THEME.light : semantic,
        dark: entry.isNightTheme ? semantic : DEFAULT_APP_THEME.dark,
      },
    },
  };
  return touchThemePack(pack);
}

/** Legado themeConfig.json 数组 → Theme Pack 列表 */
export function legadoThemeConfigToPacks(json: unknown): ReaderThemePackV1[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((item): item is LegadoThemeConfigEntry => {
      return (
        item != null &&
        typeof item === 'object' &&
        typeof (item as LegadoThemeConfigEntry).themeName === 'string'
      );
    })
    .map(legadoThemeEntryToPack);
}

/** 对比导入 diff（名称 + scope 摘要） */
export function summarizeThemePackDiff(
  current: ReaderThemePackV1 | null,
  incoming: ReaderThemePackV1,
): string[] {
  const lines: string[] = [];
  if (!current) {
    lines.push(`新建主题「${incoming.name}」`);
    return lines;
  }
  if (current.name !== incoming.name) {
    lines.push(`名称: ${current.name} → ${incoming.name}`);
  }
  if (JSON.stringify(current.app?.tokens.light) !== JSON.stringify(incoming.app?.tokens.light)) {
    lines.push('应用浅色语义色已变更');
  }
  if (JSON.stringify(current.viewer?.text) !== JSON.stringify(incoming.viewer?.text)) {
    lines.push('阅读器文本主题已变更');
  }
  const curFx = current.advanced?.effects?.length ?? 0;
  const inFx = incoming.advanced?.effects?.length ?? 0;
  if (curFx !== inFx) {
    lines.push(`特效数量: ${curFx} → ${inFx}`);
  }
  return lines;
}
