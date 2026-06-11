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

/** Legado JSON 列表规则常见 `$.data@all`：@ 后为提取器，不是 JSONPath 的一部分 */
function stripJsonPathExtractor(path: string): string {
  const trimmed = path.trim();
  if (!trimmed.startsWith('$')) return trimmed;
  const at = trimmed.indexOf('@');
  if (at > 0) return trimmed.slice(0, at).trim();
  return trimmed;
}

/**
 * Legado 列表规则 `$.[*]`：根为 JSON 数组时只取数组元素。
 * jsonpath-plus 的 `$.[*]` 还会递归展开对象字段，导致 4 条变 20 条。
 */
function normalizeLegadoListJsonPath(path: string, json: unknown): string {
  const trimmed = path.trim();
  if (Array.isArray(json) && trimmed === '$.[*]') {
    return '$[*]';
  }
  return path;
}

function parseJsonPathSingle(jsonPath: string, jsonString: string): string[] {
  if (!jsonPath || !jsonString) return [];
  const path = stripJsonPathExtractor(jsonPath);
  if (!path) return [];
  try {
    const json = JSON.parse(jsonString);
    const effectivePath = normalizeLegadoListJsonPath(path, json);
    const results = JSONPath({
      path: effectivePath,
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
  // {{$.x}} 由 analyze-rule.applyJsonTemplate 处理；此处 innerRule 会误留 {vip}
  if (/\{\{\s*\$/.test(rule)) {
    return rule;
  }
  const analyzer = new RuleAnalyzer(rule, true);
  const expanded = analyzer.innerRule('{$.', 1, 1, (inner) => {
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
