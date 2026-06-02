/**
 * JSON 书籍列表项规则上下文（搜索/发现共用）
 * Legado 中 @js 的 result 为对象；列表项 content 常为 JSON 字符串，需先解析。
 */

import type { RuleContext } from '@/lib/rule-engine';
import { coalesceSourceField, hexToUtf8 } from '@/lib/book-source/utils';

function parseJsonObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** 将列表项 JSON 字符串解析为对象，供 result / book 使用 */
export function parseJsonListItemRecord(
  element: string,
): Record<string, unknown> | null {
  const trimmed = element.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return parseJsonObjectRecord(parsed);
    } catch {
      return null;
    }
  }

  if (/^[0-9a-f]+$/i.test(trimmed) && trimmed.length >= 20) {
    try {
      const decoded = hexToUtf8(trimmed);
      const parsed = JSON.parse(decoded) as unknown;
      return parseJsonObjectRecord(parsed);
    } catch {
      return null;
    }
  }

  return null;
}

export function enrichJsonListItemContext(
  element: string,
  contentType: 'html' | 'json' | 'text',
  baseUrl: string,
  source: Record<string, unknown>,
  extras?: { regexGroups?: string[]; debugIndex?: number },
): RuleContext {
  const row = parseJsonListItemRecord(element);
  const effectiveContentType: 'html' | 'json' | 'text' = row ? 'json' : contentType;
  const ctx: RuleContext = {
    content: element,
    contentType: effectiveContentType,
    baseUrl,
    source,
    result: element,
    ...(extras?.debugIndex !== undefined ? { _debugIndex: extras.debugIndex } : {}),
    ...(extras?.regexGroups?.length ? { regexGroups: extras.regexGroups } : {}),
  };
  if (row) {
    const sourceName = coalesceSourceField(
      typeof row.source === 'string' ? row.source : undefined,
      typeof row.sources === 'string' ? row.sources : undefined,
    );
    if (sourceName) {
      row.source = sourceName;
      row.sources = sourceName;
    }
    // Legado 目录项常为 hex(JSON)；JSONPath / {{$.title}} 需要可解析的 JSON 正文
    const jsonContent = JSON.stringify(row);
    ctx.content = jsonContent;
    ctx.contentType = 'json';
    ctx.book = row;
    ctx.result = row;
  }
  return ctx;
}

/** 列表项为 JSON 对象时，从对象键读取简单字段规则（如 title / url） */
export function readJsonListItemField(
  context: RuleContext,
  rule: string | undefined,
): string {
  if (!rule?.trim()) return '';
  const trimmedRule = rule.trim();
  if (
    trimmedRule.startsWith('//') ||
    trimmedRule.startsWith('$.') ||
    trimmedRule.startsWith('$[') ||
    trimmedRule.startsWith('@') ||
    trimmedRule.startsWith(':') ||
    trimmedRule.includes('##') ||
    trimmedRule.includes('{{') ||
    trimmedRule.includes('@')
  ) {
    return '';
  }

  const row =
    context.result && typeof context.result === 'object' && !Array.isArray(context.result)
      ? (context.result as Record<string, unknown>)
      : parseJsonListItemRecord(String(context.content ?? ''));
  if (!row) return '';

  const value = row[trimmedRule];
  return value == null ? '' : String(value).trim();
}
