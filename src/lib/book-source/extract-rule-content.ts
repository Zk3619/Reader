/**
 * 从 ruleContent JS 返回值或 $.content 结果中提取正文
 */

import { extractApiContent } from '@/lib/book-source/extract-api-content';

export function extractContentFromRuleOutput(raw: string): string {
  return extractApiContent(raw);
}
