/**
 * 导入前与本地书源对比（对齐 Legado ImportBookSourceViewModel.comparisonSource）
 */

import { getSource } from '@/lib/database/sources';
import type { BookSourceImportProgressCallback } from '@/lib/book-source/import-progress';
import type { BookSource, NewBookSource } from '@/types';

const COMPARE_BATCH_SIZE = 64;

export interface ImportSourceComparison {
  source: NewBookSource;
  existing: BookSource | null;
  isNew: boolean;
  isUpdate: boolean;
}

async function compareOneSource(source: NewBookSource): Promise<ImportSourceComparison> {
  const existing = await getSource(source.sourceUrl);
  const incomingTime =
    typeof source.lastUpdateTime === 'number' ? source.lastUpdateTime : 0;
  const existingTime =
    typeof existing?.lastUpdateTime === 'number' ? existing.lastUpdateTime : 0;
  const isNew = !existing;
  const isUpdate = !!existing && existingTime < incomingTime;
  return { source, existing, isNew, isUpdate };
}

export async function buildImportComparisons(
  sources: NewBookSource[],
  onProgress?: BookSourceImportProgressCallback,
): Promise<ImportSourceComparison[]> {
  const result: ImportSourceComparison[] = [];
  const total = sources.length;
  onProgress?.({
    stage: 'compare',
    message: total > 0 ? `正在比对书源… (0/${total})` : '正在比对书源…',
    current: 0,
    total,
  });

  for (let i = 0; i < sources.length; i += COMPARE_BATCH_SIZE) {
    const batch = sources.slice(i, i + COMPARE_BATCH_SIZE);
    const batchResults = await Promise.all(batch.map((source) => compareOneSource(source)));
    result.push(...batchResults);
    const done = Math.min(i + COMPARE_BATCH_SIZE, total);
    onProgress?.({
      stage: 'compare',
      message: `正在比对书源… (${done}/${total})`,
      current: done,
      total,
    });
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
