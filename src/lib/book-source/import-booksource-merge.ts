/**
 * 导入合并策略（对齐 Legado ImportBookSourceViewModel.importSelect）
 */

import type { BookSource, NewBookSource } from '@/types';

const GROUP_SPLIT = /[,，;；]\s*/;

export interface ImportBookSourceOptions {
  keepName?: boolean;
  keepGroup?: boolean;
  keepEnable?: boolean;
  /** 导入时指定分组名 */
  groupName?: string;
  /** true=追加分组；false=覆盖为 groupName */
  addGroup?: boolean;
}

function splitGroups(group?: string | null): string[] {
  if (!group?.trim()) return [];
  return group.split(GROUP_SPLIT).map((g) => g.trim()).filter(Boolean);
}

function joinGroups(groups: Iterable<string>): string | undefined {
  const list = [...new Set(groups)].filter(Boolean);
  return list.length > 0 ? list.join(',') : undefined;
}

function applyImportGroup(
  incomingGroup: string | undefined,
  groupName: string | undefined,
  addGroup: boolean
): string | undefined {
  const name = groupName?.trim();
  if (!name) return incomingGroup;
  if (addGroup) {
    const groups = new Set(splitGroups(incomingGroup));
    groups.add(name);
    return joinGroups(groups);
  }
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

  merged.sourceGroup = applyImportGroup(
    merged.sourceGroup,
    options.groupName,
    options.addGroup === true
  );

  return merged;
}
