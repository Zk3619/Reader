/**
 * 字典规则查词（对齐 Legado DictRule.search）
 */

import { fetchByAnalyzeUrl } from '@/lib/book-source/analyze-url';
import { buildUrl } from '@/lib/book-source/utils';
import { analyzeString } from '@/lib/rule-engine/analyze-rule';
import type { DictRule } from '@/types';

export async function searchDictRule(rule: DictRule, word: string): Promise<string> {
  const key = word.trim();
  if (!key) return '';

  const ruleUrl = buildUrl(rule.urlRule, { key });
  const fetched = await fetchByAnalyzeUrl({
    ruleUrl,
    keyword: key,
  });
  const { body, url } = fetched;

  if (!rule.showRule.trim()) {
    return body;
  }

  return analyzeString(rule.showRule, {
    content: body,
    contentType: 'html',
    baseUrl: url,
    variables: { key },
  });
}
