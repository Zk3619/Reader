import type { TxtTocRule } from '@/types';

/** 对齐 Legado TxtTocRuleActivity.initData 搜索逻辑 */
export function filterTxtTocRules(rules: TxtTocRule[], query: string): TxtTocRule[] {
  const key = query.trim();
  if (!key) return rules;
  if (key === '启用') return rules.filter((r) => r.enable);
  if (key === '禁用') return rules.filter((r) => !r.enable);
  const lower = key.toLowerCase();
  return rules.filter((r) => {
    const haystack = [r.name, r.example ?? '', r.rule].join('\n').toLowerCase();
    return haystack.includes(lower);
  });
}
