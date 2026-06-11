/**
 * RSS 源导入合并策略
 */

import type { NewRssSource, RssSource } from '@/types';

export interface ImportRssSourceOptions {
  keepName?: boolean;
  keepGroup?: boolean;
  keepEnable?: boolean;
  groupName?: string;
  adjustGroup?: boolean;
}

function applyAdjustGroup(
  incomingGroup: string | undefined,
  groupName: string | undefined,
  adjustGroup: boolean,
): string | undefined {
  if (!adjustGroup) return incomingGroup;
  const name = groupName?.trim();
  if (!name) return undefined;
  return name;
}

export function mergeRssSourceForImport(
  incoming: NewRssSource,
  existing: RssSource | null,
  options: ImportRssSourceOptions,
): NewRssSource {
  const merged: NewRssSource = { ...incoming };

  if (existing) {
    if (options.keepName) {
      merged.sourceName = existing.sourceName;
    }
    if (options.keepGroup) {
      merged.sourceGroup = existing.sourceGroup;
    }
    if (options.keepEnable) {
      merged.enabled = existing.enabled;
    }
    merged.customOrder = existing.customOrder;
  }

  merged.sourceGroup = applyAdjustGroup(
    merged.sourceGroup,
    options.groupName,
    options.adjustGroup === true,
  );

  return merged;
}
