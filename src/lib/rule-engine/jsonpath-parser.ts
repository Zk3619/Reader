/**
 * JSONPath解析器
 * 对应 legado 项目的 AnalyzeByJSonPath.kt
 */

import { JSONPath } from 'jsonpath-plus';
import {
  mergeRulePartsSync,
  RuleAnalyzer,
} from '@/lib/rule-engine/rule-analyzer';

function valueToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function flattenJsonPathResults(results: unknown[]): string[] {
  const flat: unknown[] = [];
  for (const item of results) {
    if (Array.isArray(item)) flat.push(...item);
    else flat.push(item);
  }
  return flat.map(valueToString).filter((r) => r.trim().length > 0);
}

function parseJsonPathSingle(jsonPath: string, jsonString: string): string[] {
  if (!jsonPath || !jsonString) return [];
  try {
    const json = JSON.parse(jsonString);
    const results = JSONPath({
      path: jsonPath,
      json,
      wrap: true,
    });
    if (!results || results.length === 0) return [];
    return flattenJsonPathResults(results);
  } catch (error) {
    console.error('JSONPath解析错误:', error, '规则:', jsonPath);
    return [];
  }
}

function expandInnerJsonRules(rule: string, jsonString: string): string {
  const analyzer = new RuleAnalyzer(rule, true);
  const expanded = analyzer.innerRule('{$.', 2, 1, (inner) => {
    const values = parseJsonPathSingle(inner.trim(), jsonString);
    return values.length > 0 ? values.join('\n') : null;
  });
  return expanded || rule;
}

/**
 * 解析JSONPath规则（支持 && / || / %% 与 {$....} 内嵌）
 */
export function parseJsonPath(jsonPath: string, jsonString: string): string[] {
  if (!jsonPath || !jsonString) return [];

  return mergeRulePartsSync(
    jsonPath,
    (part) => {
      const expanded = expandInnerJsonRules(part, jsonString);
      if (expanded !== part) {
        return expanded.trim() ? [expanded] : [];
      }
      return parseJsonPathSingle(part, jsonString);
    },
    (x) => x,
  );
}
