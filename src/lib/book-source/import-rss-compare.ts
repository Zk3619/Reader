/**
 * RSS 源导入前对比（对齐 Legado ImportRssSourceViewModel.comparisonSource）
 */

import { getRssSource } from '@/lib/database/rss-sources';
import type { NewRssSource, RssSource } from '@/types';

export interface ImportRssSourceComparison {
  source: NewRssSource;
  existing: RssSource | null;
  isNew: boolean;
  isUpdate: boolean;
}

export async function buildRssImportComparisons(
  sources: NewRssSource[],
): Promise<ImportRssSourceComparison[]> {
  const result: ImportRssSourceComparison[] = [];
  for (const source of sources) {
    const existing = await getRssSource(source.sourceUrl);
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

export function defaultRssImportSelection(
  comparisons: ImportRssSourceComparison[],
): Set<string> {
  return new Set(
    comparisons
      .filter((c) => c.isNew || c.isUpdate)
      .map((c) => c.source.sourceUrl),
  );
}
