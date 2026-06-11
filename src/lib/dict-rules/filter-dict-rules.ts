import type { DictRule } from '@/types';

/** 对齐 Legado DictRuleActivity 搜索逻辑 */
export function filterDictRules(rules: DictRule[], query: string): DictRule[] {
  const key = query.trim();
  if (!key) return rules;
  if (key === '启用') return rules.filter((r) => r.enabled);
  if (key === '禁用') return rules.filter((r) => !r.enabled);
  const lower = key.toLowerCase();
  return rules.filter((r) => {
    const haystack = [r.name, r.urlRule, r.showRule].join('\n').toLowerCase();
    return haystack.includes(lower);
  });
}
