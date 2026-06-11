import type { ReplaceRule } from '@/types';

/** 对齐 Legado ReplaceRuleActivity 搜索逻辑 */
export function filterReplaceRules(rules: ReplaceRule[], query: string): ReplaceRule[] {
  const key = query.trim();
  if (!key) return rules;
  if (key === '启用') return rules.filter((r) => r.isEnabled);
  if (key === '禁用') return rules.filter((r) => !r.isEnabled);
  const lower = key.toLowerCase();
  return rules.filter((r) => {
    const haystack = [r.name, r.group ?? '', r.pattern, r.replacement, r.scope ?? ''].join('\n').toLowerCase();
    return haystack.includes(lower);
  });
}
