/**
 * 导入合并策略（对齐 Legado ImportBookSourceViewModel.importSelect）
 */

import type { BookSource, NewBookSource } from '@/types';

export interface ImportBookSourceOptions {
  keepName?: boolean;
  keepGroup?: boolean;
  keepEnable?: boolean;
  /** 导入时指定分组名（配合 adjustGroup） */
  groupName?: string;
  /** true=按 groupName 替换分组；空则清除分组 */
  adjustGroup?: boolean;
}

function applyAdjustGroup(
  incomingGroup: string | undefined,
  groupName: string | undefined,
  adjustGroup: boolean
): string | undefined {
  if (!adjustGroup) return incomingGroup;
  const name = groupName?.trim();
  if (!name) return undefined;
  return name;
}

export function mergeBookSourceForImport(
  incoming: NewBookSource,
  existing: BookSource | null,
  options: ImportBookSourceOptions
): NewBookSource {
  const merged: NewBookSource = { ...incoming };

  if (existing) {
    if (options.keepName) {
      merged.sourceName = existing.sourceName;
    }
    if (options.keepGroup) {
      merged.sourceGroup = existing.sourceGroup;
    }
    if (options.keepEnable) {
      merged.enabled = existing.enabled;
      merged.enableExplore = existing.enableExplore;
    }
    merged.customOrder = existing.customOrder;
  }

  merged.sourceGroup = applyAdjustGroup(
    merged.sourceGroup,
    options.groupName,
    options.adjustGroup === true
  );

  return merged;
}
