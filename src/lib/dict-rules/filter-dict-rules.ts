import type { DictRule } from '@/types';

/** 对齐 Legado DictRuleActivity 搜索逻辑 */
export function dictRuleMatchesSearch(rule: DictRule, query: string): boolean {
  const key = query.trim();
  if (!key) return true;
  if (key === '启用') return rule.enabled;
  if (key === '禁用') return !rule.enabled;
  const lower = key.toLowerCase();
  const haystack = [rule.name, rule.urlRule, rule.showRule].join('\n').toLowerCase();
  return haystack.includes(lower);
}

export function filterDictRules(rules: DictRule[], query: string): DictRule[] {
  const key = query.trim();
  if (!key) return rules;
  return rules.filter((r) => dictRuleMatchesSearch(r, key));
}
