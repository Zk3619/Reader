/**
 * 规则解析引擎统一导出
 * 对应 legado 项目的 AnalyzeRule.kt 及相关解析器
 */

// 核心分析器
export {
  parseRule,
  analyzeRule,
  analyzeString,
  analyzeStringList,
  type RuleMode,
  type ParsedRule,
  type RuleContext,
} from '@/lib/rule-engine/analyze-rule';

// 各解析器
export { parseCss } from '@/lib/rule-engine/css-parser';
export { parseXPath } from '@/lib/rule-engine/xpath-parser';
export { parseJsonPath } from '@/lib/rule-engine/jsonpath-parser';
export { parseRegex } from '@/lib/rule-engine/regex-parser';
export { evalJs, initJsSandbox, type JsContext } from '@/lib/js-engine';
