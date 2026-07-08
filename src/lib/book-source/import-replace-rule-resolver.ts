/**
 * 替换规则批量导入（选择性导入 + 合并）
 */

import {
  importReplaceRuleItems,
  parseReplaceRuleImportItems,
  type ReplaceRuleImportItem,
  type ImportReplaceRuleOptions,
} from '@/lib/book-source/import-replace-rule';
import { fetchBookSourceJsonText } from '@/lib/book-source/import-booksource-fetch';
import { assertReplaceRuleNetworkJson } from '@/lib/book-source/import-network-sidecar';
export type { ImportReplaceRuleComparison } from '@/lib/book-source/import-replace-rule-compare';
export type { ImportReplaceRuleOptions } from '@/lib/book-source/import-replace-rule';
export {
  buildImportReplaceRuleComparisons,
  defaultImportReplaceRuleSelection,
} from '@/lib/book-source/import-replace-rule-compare';

export async function resolveReplaceRulesFromNetworkUrl(
  url: string,
): Promise<ReplaceRuleImportItem[]> {
  const text = await fetchBookSourceJsonText(url.trim());
  await assertReplaceRuleNetworkJson(text);
  return parseReplaceRuleImportItems(text);
}

export async function resolveReplaceRulesFromText(
  text: string,
): Promise<ReplaceRuleImportItem[]> {
  return parseReplaceRuleImportItems(text);
}

export async function importSelectedReplaceRules(
  items: ReplaceRuleImportItem[],
  options: ImportReplaceRuleOptions = {},
): Promise<number> {
  return importReplaceRuleItems(items, options);
}
