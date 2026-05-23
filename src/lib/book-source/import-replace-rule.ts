import type { ReplaceRule } from '@/types';
import * as replaceDb from '@/lib/database/replace-rules';

interface LegadoReplaceItem {
  [key: string]: unknown;
  id?: number;
  name?: string;
  group?: string;
  pattern?: string;
  replacement?: string;
  scope?: string;
  scopeTitle?: boolean;
  scopeContent?: boolean;
  excludeScope?: string;
  isEnabled?: boolean;
  isRegex?: boolean;
  timeoutMillisecond?: number;
  order?: number;
  sortOrder?: number;
}

function normalizeReplaceItem(raw: LegadoReplaceItem, fallbackOrder: number): Omit<ReplaceRule, 'id'> {
  return {
    name: String(raw.name ?? '导入规则'),
    group: raw.group != null ? String(raw.group) : undefined,
    pattern: String(raw.pattern ?? ''),
    replacement: String(raw.replacement ?? ''),
    scope: raw.scope != null ? String(raw.scope) : undefined,
    scopeTitle: Boolean(raw.scopeTitle),
    scopeContent: raw.scopeContent !== false,
    excludeScope: raw.excludeScope != null ? String(raw.excludeScope) : undefined,
    isEnabled: raw.isEnabled !== false,
    isRegex: raw.isRegex !== false,
    timeoutMillisecond: Number(raw.timeoutMillisecond ?? 3000),
    order: Number(raw.order ?? raw.sortOrder ?? fallbackOrder),
  };
}

export function parseReplaceRuleJson(jsonText: string): Omit<ReplaceRule, 'id'>[] {
  const trimmed = jsonText.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return [];
  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return [];
  }
  const items = Array.isArray(data) ? data : [data];
  const out: Omit<ReplaceRule, 'id'>[] = [];
  items.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    out.push(normalizeReplaceItem(item as LegadoReplaceItem, index));
  });
  return out;
}

export async function importReplaceRulesFromJson(jsonText: string): Promise<number> {
  const rules = parseReplaceRuleJson(jsonText);
  let count = 0;
  for (const rule of rules) {
    if (!rule.pattern) continue;
    await replaceDb.insertReplaceRule({
      id: 0,
      name: rule.name,
      group: rule.group,
      pattern: rule.pattern,
      replacement: rule.replacement,
      scope: rule.scope,
      scopeTitle: rule.scopeTitle,
      scopeContent: rule.scopeContent,
      excludeScope: rule.excludeScope,
      isEnabled: rule.isEnabled,
      isRegex: rule.isRegex,
      timeoutMillisecond: rule.timeoutMillisecond,
      order: rule.order,
    });
    count += 1;
  }
  if (count > 0) {
    window.dispatchEvent(new CustomEvent('replace-rules-refresh'));
  }
  return count;
}
