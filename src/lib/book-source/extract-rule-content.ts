/**
 * 从 ruleContent JS 返回值或 $.content 结果中提取正文
 * 对齐 Legado BookContent.analyzeContent：规则链输出即正文，框架不再二次「智能解析」
 */

import {
  extractApiContent,
  isApiErrorText,
  materializeAggregationContentBody,
} from '@/lib/book-source/extract-api-content';

export function extractContentFromRuleOutput(raw: string): string {
  const text = raw.trim();
  if (!text) return '';
  if (isApiErrorText(text)) return '';

  // 规则链 $.content 已输出 HTML
  if (text.includes('<img') || text.includes('<p') || text.includes('<div')) {
    return text;
  }

  // 聚合 API 有时把 HTML 放在 hex 字符串里（书源仍写 content = data.content）
  const materialized = materializeAggregationContentBody(text);
  if (materialized.includes('<img')) {
    return materialized;
  }

  // 规则脚本返回 {"content":"..."} 且未走 $.content 时
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (
      parsed &&
      typeof parsed === 'object' &&
      !('code' in parsed) &&
      typeof parsed.content === 'string' &&
      parsed.content.trim()
    ) {
      const inner = materializeAggregationContentBody(parsed.content.trim());
      return inner.includes('<') ? inner : parsed.content;
    }
  } catch {
    /* fall through */
  }

  // 仅当仍是 API JSON 时回退（如直连 /content 未跑规则）
  return extractApiContent(raw);
}
