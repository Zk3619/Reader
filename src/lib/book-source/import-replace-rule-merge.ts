/**
 * 替换规则导入合并策略（对齐 Legado ImportReplaceRule）
 */

import type { ReplaceRule } from '@/types';

export interface ImportReplaceRuleOptions {
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

export function mergeReplaceRuleForImport(
  incoming: Omit<ReplaceRule, 'id'>,
  existing: ReplaceRule | null,
  options: ImportReplaceRuleOptions = {},
): Omit<ReplaceRule, 'id'> {
  const merged: Omit<ReplaceRule, 'id'> = { ...incoming };

  if (existing) {
    if (options.keepGroup) {
      merged.group = existing.group;
    }
    if (options.keepEnable) {
      merged.isEnabled = existing.isEnabled;
    }
    merged.order = existing.order;
  }

  merged.group = applyAdjustGroup(merged.group, options.groupName, options.adjustGroup === true);

  return merged;
}
