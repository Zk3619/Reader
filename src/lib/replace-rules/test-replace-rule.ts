/**
 * 测试单条替换规则（对齐 Legado ReplaceRuleController.testRule）
 */

import { applyReplaceRuleToText } from '@/lib/replace-rules/replace-text';
import type { ReplaceRule } from '@/types';

export async function testReplaceRule(
  rule: Pick<
    ReplaceRule,
    'name' | 'pattern' | 'replacement' | 'isRegex' | 'isEnabled' | 'timeoutMillisecond'
  >,
  sampleText: string,
): Promise<string> {
  const fullRule: ReplaceRule = {
    id: 0,
    name: rule.name || '测试',
    pattern: rule.pattern,
    replacement: rule.replacement ?? '',
    scopeTitle: false,
    scopeContent: true,
    isEnabled: rule.isEnabled !== false,
    isRegex: rule.isRegex !== false,
    timeoutMillisecond: rule.timeoutMillisecond ?? 3000,
    order: 0,
  };
  return applyReplaceRuleToText(sampleText, fullRule);
}
