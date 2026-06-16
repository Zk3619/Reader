import type { TxtTocRule } from '@/types';

/** 对齐 Legado TxtTocRuleActivity.initData 搜索逻辑 */
export function txtTocRuleMatchesSearch(rule: TxtTocRule, query: string): boolean {
  const key = query.trim();
  if (!key) return true;
  if (key === '启用') return rule.enable;
  if (key === '禁用') return !rule.enable;
  const lower = key.toLowerCase();
  const haystack = [rule.name, rule.example ?? '', rule.rule].join('\n').toLowerCase();
  return haystack.includes(lower);
}

export function filterTxtTocRules(rules: TxtTocRule[], query: string): TxtTocRule[] {
  const key = query.trim();
  if (!key) return rules;
  return rules.filter((r) => txtTocRuleMatchesSearch(r, key));
}
