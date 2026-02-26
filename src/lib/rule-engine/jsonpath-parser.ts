/**
 * JSONPath解析器
 * 对应 legado 项目的 AnalyzeByJSonPath.kt
 * 
 * 使用 jsonpath-plus 解析JSONPath表达式
 */

import { JSONPath } from 'jsonpath-plus';

/**
 * 将任意值转为字符串
 */
function valueToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/**
 * 解析JSONPath规则
 * 
 * 与 legado 行为一致：如果 JSONPath 结果中某项是数组，则将其展开（flatten），
 * 使得 bookList 等列表规则（如 $.data）能正确拆分为逐条记录。
 */
export function parseJsonPath(jsonPath: string, jsonString: string): string[] {
  if (!jsonPath || !jsonString) {
    return [];
  }

  try {
    // 解析JSON字符串
    const json = JSON.parse(jsonString);

    // 执行JSONPath查询
    const results = JSONPath({
      path: jsonPath,
      json,
      wrap: true, // 始终返回数组
    });

    if (!results || results.length === 0) {
      return [];
    }

    // 展平 + 转换为字符串数组
    // legado 的 getStringList 会把数组类型的结果展开为逐个元素，
    // 例如 $.data 返回 [[{book1},{book2},...]] → 展开为 [{book1},{book2},...]
    const flat: unknown[] = [];
    for (const item of results) {
      if (Array.isArray(item)) {
        flat.push(...item);
      } else {
        flat.push(item);
      }
    }

    return flat
      .map(valueToString)
      .filter((r) => r.trim().length > 0);
  } catch (error) {
    console.error('JSONPath解析错误:', error, '规则:', jsonPath);
    return [];
  }
}
