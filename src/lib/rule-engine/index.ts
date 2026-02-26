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
} from './analyze-rule';

// 各解析器
export { parseCss } from './css-parser';
export { parseXPath } from './xpath-parser';
export { parseJsonPath } from './jsonpath-parser';
export { parseRegex } from './regex-parser';
export { evalJs, initJsSandbox, type JsContext } from './js-sandbox';
