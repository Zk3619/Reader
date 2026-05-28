/**
 * 对齐 Legado AnalyzeRule.getString / java.getString（Rhino 中 java 即 AnalyzeRule）
 * 在 @js / <js> 内同步解析子规则。
 */

import { parseCss } from '@/lib/rule-engine/css-parser';
import { parseJsonPath } from '@/lib/rule-engine/jsonpath-parser';
import { mergeRulePartsSync, splitRuleByOperators } from '@/lib/rule-engine/rule-analyzer';
import { parseXPath } from '@/lib/rule-engine/xpath-parser';

export interface JavaGetStringContext {
  content: string;
  contentType?: 'html' | 'json' | 'text';
  baseUrl?: string;
  variables?: Record<string, unknown>;
  getVariable?: (key: string) => string;
  /** 对齐 getString0(isUrl)：仅取首个匹配 */
  isUrl?: boolean;
}

function resolveGetVariable(ctx: JavaGetStringContext, key: string): string {
  if (ctx.getVariable) return ctx.getVariable(key);
  const v = ctx.variables?.[key];
  return v == null ? '' : String(v);
}

/**
 * 同步执行单条规则（供 java.getString 使用，勿含需异步展开的 {{}}）
 */
export function javaGetString(rule: string, ctx: JavaGetStringContext): string {
  const expr = String(rule ?? '').trim();
  if (!expr) return '';

  if (expr.startsWith('@get:{') && expr.endsWith('}')) {
    return resolveGetVariable(ctx, expr.slice(6, -1).trim());
  }

  const content = ctx.content;
  if (!content) return '';

  if (expr.startsWith('$.') || expr.startsWith('$[')) {
    return parseJsonPath(expr, content)[0] ?? '';
  }

  if (expr.startsWith('//') || (expr.startsWith('/') && !expr.startsWith('/*'))) {
    const parts = parseXPath(expr, content, ctx.baseUrl).filter((r) => r.trim().length > 0);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    return parts.join('\n');
  }

  const { parts, op } = splitRuleByOperators(expr);
  if (op === '||' && parts.length > 1) {
    for (const part of parts) {
      const hit = runCssOrDefault(part, ctx);
      if (hit) return hit;
    }
    return '';
  }

  const merged = mergeRulePartsSync(expr, (part) => parseCss(part, content), (x) => x);
  const filtered = merged.filter((r) => r.trim().length > 0);
  if (filtered.length === 0) return '';
  if (ctx.isUrl) return filtered[0].trim();
  if (filtered.length === 1) return filtered[0];
  return filtered.join('\n');
}

function runCssOrDefault(part: string, ctx: JavaGetStringContext): string {
  const list = parseCss(part.trim(), ctx.content);
  const hit = list.find((r) => r.trim().length > 0);
  return hit?.trim() ?? '';
}
