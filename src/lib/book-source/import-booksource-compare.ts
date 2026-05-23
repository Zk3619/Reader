/**
 * 导入前与本地书源对比（对齐 Legado ImportBookSourceViewModel.comparisonSource）
 */

import { getSource } from '@/lib/database/sources';
import type { BookSource, NewBookSource } from '@/types';

export interface ImportSourceComparison {
  source: NewBookSource;
  existing: BookSource | null;
  isNew: boolean;
  isUpdate: boolean;
}

export async function buildImportComparisons(
  sources: NewBookSource[]
): Promise<ImportSourceComparison[]> {
  const result: ImportSourceComparison[] = [];
  for (const source of sources) {
    const existing = await getSource(source.sourceUrl);
    const incomingTime =
      typeof source.lastUpdateTime === 'number' ? source.lastUpdateTime : 0;
    const existingTime =
      typeof existing?.lastUpdateTime === 'number' ? existing.lastUpdateTime : 0;
    const isNew = !existing;
    const isUpdate = !!existing && existingTime < incomingTime;
    result.push({ source, existing, isNew, isUpdate });
  }
  return result;
}

/** 默认勾选：新增或远程更新时间更晚的书源 */
export function defaultImportSelection(comparisons: ImportSourceComparison[]): Set<string> {
  return new Set(
    comparisons
      .filter((c) => c.isNew || c.isUpdate)
      .map((c) => c.source.sourceUrl)
  );
}
