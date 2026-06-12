import type { ReplaceRule } from '@/types';

export const UNGROUPED_REPLACE_RULE_LABEL = '未分组';

export type ReplaceRuleGroupFilter =
  | { kind: 'all' }
  | { kind: 'enabled' }
  | { kind: 'disabled' }
  | { kind: 'ungrouped' }
  | { kind: 'group'; name: string };

/** 对齐 Legado ReplaceRuleActivity 搜索逻辑 */
export function filterReplaceRules(rules: ReplaceRule[], query: string): ReplaceRule[] {
  const key = query.trim();
  if (!key) return rules;
  if (key === '启用') return rules.filter((r) => r.isEnabled);
  if (key === '禁用') return rules.filter((r) => !r.isEnabled);
  const lower = key.toLowerCase();
  return rules.filter((r) => {
    const haystack = [r.name, r.group ?? '', r.pattern, r.replacement, r.scope ?? '']
      .join('\n')
      .toLowerCase();
    return haystack.includes(lower);
  });
}

export function applyReplaceRuleGroupFilter(
  rules: ReplaceRule[],
  filter: ReplaceRuleGroupFilter,
): ReplaceRule[] {
  switch (filter.kind) {
    case 'all':
      return rules;
    case 'enabled':
      return rules.filter((r) => r.isEnabled);
    case 'disabled':
      return rules.filter((r) => !r.isEnabled);
    case 'ungrouped':
      return rules.filter(
        (r) => !r.group?.trim() || r.group.trim().includes(UNGROUPED_REPLACE_RULE_LABEL),
      );
    case 'group':
      return rules.filter((r) => (r.group ?? '').includes(filter.name));
  }
}

export function filterReplaceRulesList(
  rules: ReplaceRule[],
  query: string,
  groupFilter: ReplaceRuleGroupFilter,
): ReplaceRule[] {
  return filterReplaceRules(applyReplaceRuleGroupFilter(rules, groupFilter), query);
}

export function replaceRuleGroupFilterKey(filter: ReplaceRuleGroupFilter): string {
  switch (filter.kind) {
    case 'all':
      return 'all';
    case 'enabled':
      return 'enabled';
    case 'disabled':
      return 'disabled';
    case 'ungrouped':
      return 'ungrouped';
    case 'group':
      return `group:${filter.name}`;
  }
}

export function replaceRuleGroupFilterTitle(filter: ReplaceRuleGroupFilter): string {
  switch (filter.kind) {
    case 'all':
      return '全部规则';
    case 'enabled':
      return '已启用';
    case 'disabled':
      return '已禁用';
    case 'ungrouped':
      return UNGROUPED_REPLACE_RULE_LABEL;
    case 'group':
      return filter.name;
  }
}
