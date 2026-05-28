/**
 * JSON 书籍列表项规则上下文（搜索/发现共用）
 * Legado 中 @js 的 result 为对象；列表项 content 常为 JSON 字符串，需先解析。
 */

import type { RuleContext } from '@/lib/rule-engine';

/** 将列表项 JSON 字符串解析为对象，供 result / book 使用 */
export function parseJsonListItemRecord(
  element: string,
): Record<string, unknown> | null {
  const trimmed = element.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function enrichJsonListItemContext(
  element: string,
  contentType: 'html' | 'json' | 'text',
  baseUrl: string,
  source: Record<string, unknown>,
  extras?: { regexGroups?: string[]; debugIndex?: number },
): RuleContext {
  const ctx: RuleContext = {
    content: element,
    contentType,
    baseUrl,
    source,
    result: element,
    ...(extras?.debugIndex !== undefined ? { _debugIndex: extras.debugIndex } : {}),
    ...(extras?.regexGroups?.length ? { regexGroups: extras.regexGroups } : {}),
  };
  if (contentType === 'json') {
    const row = parseJsonListItemRecord(element);
    if (row) {
      ctx.book = row;
      ctx.result = row;
    }
  }
  return ctx;
}
