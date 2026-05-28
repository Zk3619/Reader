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
  analyzeElements,
  analyzeListElements,
  type RuleMode,
  type ParsedRule,
  type RuleContext,
  type ListElementItem,
  type AnalyzeStringOptions,
} from '@/lib/rule-engine/analyze-rule';
export { compileSourceRule, stripReplacementTail } from '@/lib/rule-engine/source-rule';
export {
  runWebJs,
  parseWebJsListResult,
  type RunWebJsOptions,
} from '@/lib/rule-engine/webjs-runner';
export { fetchByAnalyzeUrl } from '@/lib/book-source/analyze-url';
export type { AnalyzeUrlOption, FetchByAnalyzeUrlParams } from '@/lib/book-source/analyze-url';
export { applyImageDecode } from '@/lib/book-source/image-decode';
export {
  getRegexElements,
  regexGroupsToElementContent,
} from '@/lib/rule-engine/regex-parser';

// 各解析器
export { parseCss } from '@/lib/rule-engine/css-parser';
export { parseXPath } from '@/lib/rule-engine/xpath-parser';
export { parseJsonPath } from '@/lib/rule-engine/jsonpath-parser';
export { parseRegex } from '@/lib/rule-engine/regex-parser';
export {
  RuleAnalyzer,
  splitRuleByOperators,
  mergeRuleParts,
  mergeRulePartsSync,
  mergeRegexRulePartsSync,
  splitRuleByFallbackOperators,
  zipMergeRuleResults,
  type RuleSplitOp,
} from '@/lib/rule-engine/rule-analyzer';
export { evalJs, initJsSandbox, type JsContext } from '@/lib/js-engine';
