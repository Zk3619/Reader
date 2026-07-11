/**
 * 批量写入主题预设（对齐书源 / 订阅源 batch import）
 */

import { getThemePreset, upsertThemePreset } from '@/lib/database/theme-presets';
import type { ReaderThemePackV1 } from '@/lib/theme/schema/theme-pack-v1';
import {
  mergeThemePackForImport,
  type ImportThemeOptions,
} from '@/lib/theme/import/import-theme-merge';

export interface ImportThemesResult {
  inserted: number;
  skipped: number;
  keptActive: number;
}

export async function importSelectedThemes(
  packs: ReaderThemePackV1[],
  options: ImportThemeOptions = {},
): Promise<ImportThemesResult> {
  const kind = options.kind ?? 'imported';
  let inserted = 0;
  let skipped = 0;
  let keptActive = 0;

  for (const incoming of packs) {
    const existing = await getThemePreset(incoming.id);
    const merged = mergeThemePackForImport(incoming, existing, options);
    if (!merged) {
      if (existing && options.keepActive === true) {
        keptActive += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    await upsertThemePreset(merged, kind);
    inserted += 1;
  }

  return { inserted, skipped, keptActive };
}
