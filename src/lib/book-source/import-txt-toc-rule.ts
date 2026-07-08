import type { TxtTocRule } from '@/types';
import * as txtTocDb from '@/lib/database/txt-toc-rules';
import { matchesLegadoImportKind } from '@/lib/book-source/legado-import-kind';

export interface ParseTxtTocRuleJsonOptions {
  txtTocRulesOnly?: boolean;
}

interface LegadoTxtTocItem {
  [key: string]: unknown;
  id?: number;
  name?: string;
  rule?: string;
  replacement?: string;
  example?: string;
  serialNumber?: number;
  enable?: boolean;
}

function normalizeTxtTocItem(
  raw: LegadoTxtTocItem,
  fallbackOrder: number,
  options?: ParseTxtTocRuleJsonOptions,
): TxtTocRule | null {
  if (options?.txtTocRulesOnly !== false) {
    if (!matchesLegadoImportKind(raw, 'txtTocRule')) return null;
  }
  return {
    id: Number(raw.id ?? 0),
    name: String(raw.name ?? '导入规则'),
    rule: String(raw.rule ?? ''),
    replacement: String(raw.replacement ?? ''),
    example: raw.example != null ? String(raw.example) : undefined,
    serialNumber: Number(raw.serialNumber ?? fallbackOrder),
    enable: raw.enable !== false,
  };
}

export function parseTxtTocRuleJson(
  jsonText: string,
  options?: ParseTxtTocRuleJsonOptions,
): TxtTocRule[] {
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
    .map((item, index) => normalizeTxtTocItem(item as LegadoTxtTocItem, index, options))
    .filter((rule): rule is TxtTocRule => rule != null);
}

export async function importTxtTocRulesFromJson(jsonText: string): Promise<number> {
  const rules = parseTxtTocRuleJson(jsonText);
  let count = 0;
  for (const rule of rules) {
    if (!rule.name.trim()) continue;
    const id = rule.id !== 0 ? rule.id : await txtTocDb.allocateTxtTocRuleId();
    await txtTocDb.upsertTxtTocRule({ ...rule, id });
    count += 1;
  }
  return count;
}
