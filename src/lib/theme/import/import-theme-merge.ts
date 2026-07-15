/**
 * 主题导入合并策略（按 pack.id 对比）
 */

import { BUILTIN_DEFAULT_PRESET_ID } from '@/lib/theme/theme-preset-file-storage';
import { getThemePreset } from '@/lib/database/theme-presets';
import type { ReaderThemePackV1, ThemePresetRecord } from '@/lib/theme/schema/theme-pack-v1';
import { settingsStore } from '@/stores/settings';
import {
  isThemePresetActive,
  normalizeActiveThemePresetByTarget,
} from '@/lib/theme/theme-targets';

export interface ImportThemeOptions {
  /** 已存在时保留本地显示名 */
  keepName?: boolean;
  /** 已存在且为当前激活预设时不覆盖 manifest */
  keepActive?: boolean;
  /** ZIP 资产是否覆盖（false 时保留本地已有资产清单） */
  overwriteAssets?: boolean;
  kind?: 'imported' | 'user';
}

export interface ImportThemeComparison {
  incoming: ReaderThemePackV1;
  existing: ThemePresetRecord | null;
  status: 'new' | 'update';
}

const COMPARE_BATCH_SIZE = 32;

function parsePackUpdatedAt(pack: ReaderThemePackV1): number {
  const parsed = Date.parse(pack.updatedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isActiveThemePreset(id: string): boolean {
  const app = settingsStore.state.app;
  return isThemePresetActive(
    id,
    normalizeActiveThemePresetByTarget(app.activeThemePresetByTarget, app),
  );
}

async function compareOneTheme(pack: ReaderThemePackV1): Promise<ImportThemeComparison> {
  const existing = await getThemePreset(pack.id);
  return {
    incoming: pack,
    existing,
    status: existing ? 'update' : 'new',
  };
}

export async function buildImportComparisons(
  packs: ReaderThemePackV1[],
): Promise<ImportThemeComparison[]> {
  const result: ImportThemeComparison[] = [];
  for (let i = 0; i < packs.length; i += COMPARE_BATCH_SIZE) {
    const batch = packs.slice(i, i + COMPARE_BATCH_SIZE);
    const batchResults = await Promise.all(batch.map((pack) => compareOneTheme(pack)));
    result.push(...batchResults);
  }
  return result;
}

/** 默认勾选：新增或 incoming 更新时间更晚的主题 */
export function defaultImportSelection(comparisons: ImportThemeComparison[]): Set<string> {
  return new Set(
    comparisons
      .filter((c) => {
        if (c.status === 'new') return true;
        if (!c.existing) return false;
        const incomingTime = parsePackUpdatedAt(c.incoming);
        const existingTime = parsePackUpdatedAt(c.existing.manifest);
        return incomingTime > existingTime;
      })
      .map((c) => c.incoming.id),
  );
}

export function mergeThemePackForImport(
  incoming: ReaderThemePackV1,
  existing: ThemePresetRecord | null,
  options: ImportThemeOptions,
): ReaderThemePackV1 | null {
  if (incoming.id === BUILTIN_DEFAULT_PRESET_ID) {
    return null;
  }

  if (existing && options.keepActive === true && isActiveThemePreset(existing.id)) {
    return null;
  }

  const merged: ReaderThemePackV1 = structuredClone(incoming);

  if (existing) {
    if (options.keepName) {
      merged.name = existing.manifest.name;
    }
    if (options.overwriteAssets === false && existing.manifest.assets) {
      merged.assets = structuredClone(existing.manifest.assets);
    }
  }

  return merged;
}
