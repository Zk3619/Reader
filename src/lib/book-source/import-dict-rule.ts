import type { DictRule } from '@/types';
import * as dictDb from '@/lib/database/dict-rules';

interface LegadoDictItem {
  [key: string]: unknown;
  name?: string;
  urlRule?: string;
  showRule?: string;
  enabled?: boolean;
  sortNumber?: number;
}

function normalizeDictItem(raw: LegadoDictItem, fallbackOrder: number): DictRule {
  return {
    name: String(raw.name ?? '导入规则'),
    urlRule: String(raw.urlRule ?? ''),
    showRule: String(raw.showRule ?? ''),
    enabled: raw.enabled !== false,
    sortNumber: Number(raw.sortNumber ?? fallbackOrder),
  };
}

export function parseDictRuleJson(jsonText: string): DictRule[] {
  const trimmed = jsonText.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return [];
  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return [];
  }
  const items = Array.isArray(data) ? data : [data];
  return items
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => normalizeDictItem(item as LegadoDictItem, index));
}

export async function importDictRulesFromJson(jsonText: string): Promise<number> {
  const rules = parseDictRuleJson(jsonText);
  let count = 0;
  for (const rule of rules) {
    if (!rule.name.trim()) continue;
    await dictDb.upsertDictRule(rule);
    count += 1;
  }
  return count;
}
