/**
 * 影视配置导入比对（单一源库：新 / 更新 / 已有）
 */

import type { TvConfigRow } from '../types';
import type { IdentifiedTvConfig } from './tv-config-import-identify';

export interface ImportTvConfigComparison {
  source: IdentifiedTvConfig;
  existing: TvConfigRow | null;
  isNew: boolean;
  isUpdate: boolean;
  key: string;
}

function normalizeJsonForCompare(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json));
  } catch {
    return json.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  }
}

function findExisting(
  source: IdentifiedTvConfig,
  locals: TvConfigRow[],
): TvConfigRow | null {
  const byUrl = locals.find((r) => r.url === source.url);
  if (byUrl) return byUrl;
  const srcNorm = normalizeJsonForCompare(source.json);
  for (const r of locals) {
    if (normalizeJsonForCompare(r.json) === srcNorm) return r;
  }
  return null;
}

export function buildTvConfigImportComparisons(
  sources: IdentifiedTvConfig[],
  locals: TvConfigRow[],
): ImportTvConfigComparison[] {
  const result: ImportTvConfigComparison[] = [];
  const seenHash = new Set<string>();

  for (const source of sources) {
    if (source.contentHash && seenHash.has(source.contentHash)) {
      result.push({
        source,
        existing: null,
        isNew: false,
        isUpdate: false,
        key: source.id,
      });
      continue;
    }
    if (source.contentHash) seenHash.add(source.contentHash);

    const existing = findExisting(source, locals);
    if (!existing) {
      result.push({
        source,
        existing: null,
        isNew: true,
        isUpdate: false,
        key: source.id,
      });
      continue;
    }
    const same =
      normalizeJsonForCompare(existing.json) === normalizeJsonForCompare(source.json);
    result.push({
      source,
      existing,
      isNew: false,
      isUpdate: !same,
      key: source.id,
    });
  }
  return result;
}

export function defaultTvConfigImportSelection(
  comparisons: ImportTvConfigComparison[],
): Set<string> {
  return new Set(
    comparisons.filter((c) => c.isNew || c.isUpdate).map((c) => c.key),
  );
}
