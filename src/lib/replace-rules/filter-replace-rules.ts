import type { ReplaceRule } from '@/types';

export const UNGROUPED_REPLACE_RULE_LABEL = '未分组';

export type ReplaceRuleGroupFilter =
  | { kind: 'all' }
  | { kind: 'enabled' }
  | { kind: 'disabled' }
  | { kind: 'ungrouped' }
  | { kind: 'group'; name: string };

/** 对齐 Legado ReplaceRuleActivity 搜索逻辑 */
export function replaceRuleMatchesSearch(rule: ReplaceRule, query: string): boolean {
  const key = query.trim();
  if (!key) return true;
  if (key === '启用') return rule.isEnabled;
  if (key === '禁用') return !rule.isEnabled;
  const lower = key.toLowerCase();
  const haystack = [rule.name, rule.group ?? '', rule.pattern, rule.replacement, rule.scope ?? '']
    .join('\n')
    .toLowerCase();
  return haystack.includes(lower);
}

export function filterReplaceRules(rules: ReplaceRule[], query: string): ReplaceRule[] {
  const key = query.trim();
  if (!key) return rules;
  return rules.filter((r) => replaceRuleMatchesSearch(r, key));
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

export function replaceRuleMatchesListFilter(
  rule: ReplaceRule,
  query: string,
  groupFilter: ReplaceRuleGroupFilter,
): boolean {
  if (applyReplaceRuleGroupFilter([rule], groupFilter).length === 0) return false;
  return replaceRuleMatchesSearch(rule, query);
}

export function filterReplaceRulesList(
  rules: ReplaceRule[],
  query: string,
  groupFilter: ReplaceRuleGroupFilter,
): ReplaceRule[] {
  return rules.filter((rule) => replaceRuleMatchesListFilter(rule, query, groupFilter));
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
