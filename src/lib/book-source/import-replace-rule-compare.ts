/**
 * 替换规则导入前对比（对齐 Legado ImportReplaceRule 选择性导入）
 */

import { getReplaceRuleById } from '@/lib/database/replace-rules';
import type { ReplaceRule } from '@/types';
import type { ReplaceRuleImportItem } from '@/lib/book-source/import-replace-rule';

export interface ImportReplaceRuleComparison {
  key: string;
  item: ReplaceRuleImportItem;
  existing: ReplaceRule | null;
  isNew: boolean;
  isUpdate: boolean;
}

function importKey(item: ReplaceRuleImportItem, index: number): string {
  if (item.idHint != null && item.idHint > 0) return `id:${item.idHint}`;
  return `new:${index}:${item.rule.pattern}`;
}

export async function buildImportReplaceRuleComparisons(
  items: ReplaceRuleImportItem[],
): Promise<ImportReplaceRuleComparison[]> {
  const result: ImportReplaceRuleComparison[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    let existing: ReplaceRule | null = null;
    if (item.idHint != null && item.idHint > 0) {
      existing = await getReplaceRuleById(item.idHint);
    }
    const isNew = !existing;
    const isUpdate =
      !!existing &&
      (existing.pattern !== item.rule.pattern ||
        existing.replacement !== item.rule.replacement ||
        existing.name !== item.rule.name ||
        (existing.group ?? '') !== (item.rule.group ?? ''));
    result.push({
      key: importKey(item, i),
      item,
      existing,
      isNew,
      isUpdate,
    });
  }
  return result;
}

/** 默认勾选：新增或内容有变化的规则 */
export function defaultImportReplaceRuleSelection(
  comparisons: ImportReplaceRuleComparison[],
): Set<string> {
  return new Set(
    comparisons.filter((c) => c.isNew || c.isUpdate).map((c) => c.key),
  );
}
