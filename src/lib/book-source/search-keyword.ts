import type { SearchRule } from '@/types';

export function resolveCheckKeyword(defaultKeyword: string, rule: SearchRule): string {
  const checkKeyword = rule.checkKeyWord?.trim();
  if (!checkKeyword) return defaultKeyword;
  return checkKeyword;
}
