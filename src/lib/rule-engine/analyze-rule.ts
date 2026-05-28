/**
 * 规则分析器
 * 对应 legado 项目的 AnalyzeRule.kt
 * 
 * 功能：
 * 1. 解析规则字符串，识别解析模式（CSS/XPath/JSONPath/Regex/JS）
 * 2. 提取替换规则（##正则##替换）
 * 3. 处理变量操作（@put, @get）
 * 4. 调用相应的解析器
 */

import { parseCss, selectElementsOuterHtml } from '@/lib/rule-engine/css-parser';
import { parseXPath } from '@/lib/rule-engine/xpath-parser';
import { parseJsonPath } from '@/lib/rule-engine/jsonpath-parser';
import {
  getRegexElements,
  parseRegex,
  regexGroupsToElementContent,
} from '@/lib/rule-engine/regex-parser';
import {
  detectSourceRuleMode,
  shieldInlineReplacementJsInPattern,
  splitLegadoReplaceTail,
  splitPutRule,
  splitSourceRule,
  stripReplacementTail,
  unshieldInlineReplacementJsInPattern,
  type LegadoSourceRuleSegment,
} from '@/lib/rule-engine/legado-source-rule';
import { compileSourceRule } from '@/lib/rule-engine/source-rule';
import { splitRuleByOperators } from '@/lib/rule-engine/rule-analyzer';
import { evalJs } from '@/lib/js-engine';
import { normalizeJsRuleResult, type JsContext } from '@/lib/js-engine/quickjs-sandbox';
import { parseWebJsListResult, runWebJs } from '@/lib/rule-engine/webjs-runner';
import { isRuleExpression } from '@/lib/rule-engine/rule-expression';
import type { BookSource } from '@/types';

/**
 * 规则模式
 */
export type RuleMode = 'css' | 'xpath' | 'json' | 'regex' | 'js' | 'webjs' | 'default';

/**
 * 解析后的规则
 */
export interface ParsedRule {
  mode: RuleMode;
  ruleBody: string;
  replacement?: {
    pattern: string;
    replacement: string;
    replaceFirst?: boolean;
  };
  putMap?: Record<string, string>;
}

/**
 * 规则上下文
 */
export interface RuleContext {
  /** 要解析的内容（HTML/JSON/文本） */
  content: string;
  /** 内容类型 */
  contentType?: 'html' | 'json' | 'text';
  /** 基础URL */
  baseUrl?: string;
  /** 上一步结果（HTML/JSON 字符串或 JSON 列表项对象，供 @js 使用） */
  result?: unknown;
  /** 变量存储 */
  variables?: Record<string, unknown>;
  /** 书籍信息 */
  book?: Record<string, unknown>;
  /** 书源信息 */
  source?: Record<string, unknown>;
  /** 章节信息 */
  chapter?: Record<string, unknown>;
  /** 当前正则捕获组（$1/$2） */
  regexGroups?: string[];
}

function buildRuleJsContext(context: RuleContext, result?: unknown): JsContext {
  const content =
    typeof context.content === 'string' ? context.content : String(context.content ?? '');
  const sourceRaw = (context.source ?? {}) as Record<string, unknown>;
  const comment = sourceRaw.bookSourceComment ?? sourceRaw.sourceComment ?? '';
  const source = {
    ...sourceRaw,
    bookSourceComment: comment,
    sourceComment: comment,
    bookSourceUrl: sourceRaw.bookSourceUrl ?? sourceRaw.sourceUrl ?? '',
  };
  return {
    result: normalizeJsRuleResult(result ?? context.result ?? context.content),
    baseUrl: context.baseUrl || '',
    book: context.book,
    source,
    chapter: context.chapter,
    ruleContent: content,
    ruleContentType: context.contentType,
    variables: context.variables,
    bookSource: context.source as BookSource | undefined,
  };
}

export interface AnalyzeStringOptions {
  /** 对齐 Legado getString(..., isUrl = true) → AnalyzeByJSoup.getString0 */
  isUrl?: boolean;
}

function splitReplacementTail(rule: string): {
  ruleBody: string;
  replacement?: NonNullable<ParsedRule['replacement']>;
} {
  const text = rule.trim();
  if (!text.includes('##')) return { ruleBody: text };
  const findTopLevelDoubleHash = (input: string): number => {
    let inSingle = false;
    let inDouble = false;
    let templateDepth = 0;
    let inJsBlock = false;
    for (let i = 0; i < input.length - 1; i += 1) {
      const ch = input[i]!;
      const next = input[i + 1]!;
      if (!inSingle && !inDouble) {
        if (!inJsBlock && input.slice(i, i + 4).toLowerCase() === '<js>') {
          inJsBlock = true;
          i += 3;
          continue;
        }
        if (inJsBlock && input.slice(i, i + 5).toLowerCase() === '</js>') {
          inJsBlock = false;
          i += 4;
          continue;
        }
        if (!inJsBlock) {
          if (ch === '{' && next === '{') {
            templateDepth += 1;
            i += 1;
            continue;
          }
          if (ch === '}' && next === '}' && templateDepth > 0) {
            templateDepth -= 1;
            i += 1;
            continue;
          }
        }
      }
      if (!inJsBlock && templateDepth === 0) {
        if (ch === "'" && !inDouble && input[i - 1] !== '\\') inSingle = !inSingle;
        else if (ch === '"' && !inSingle && input[i - 1] !== '\\') inDouble = !inDouble;
        if (!inSingle && !inDouble && ch === '#' && next === '#') return i;
      }
    }
    return -1;
  };

  const first = findTopLevelDoubleHash(text);
  if (first < 0) return { ruleBody: text };
  const ruleBody = text.slice(0, first).trim();
  let tail = text.slice(first + 2);
  let replaceFirst = false;
  if (tail.endsWith('###')) {
    tail = tail.slice(0, -3);
    replaceFirst = true;
  }
  const second = findTopLevelDoubleHash(tail);
  const pattern = second >= 0 ? tail.slice(0, second) : tail;
  const replacementText = second >= 0 ? tail.slice(second + 2) : '';
  return {
    ruleBody,
    replacement: {
      pattern,
      replacement: replacementText,
      replaceFirst,
    },
  };
}

/**
 * 解析规则字符串
 */
export function parseRule(rule: string): ParsedRule {
  if (!rule) {
    return { mode: 'default', ruleBody: '' };
  }

  let mode: RuleMode = 'default';
  let ruleBody = rule.trim();
  let replacement: ParsedRule['replacement'];
  const putMap: Record<string, string> = {};

  const split = splitReplacementTail(rule);
  ruleBody = split.ruleBody;
  replacement = split.replacement;

  // 2. 提取@put变量
  ruleBody = extractPutVariables(ruleBody, putMap);

  // 3. 检测解析模式
  const lowerRule = ruleBody.toLowerCase();

  if (ruleBody.startsWith(':')) {
    mode = 'regex';
    ruleBody = ruleBody.slice(1).trim();
  } else if (lowerRule.startsWith('@css:')) {
    mode = 'css';
    ruleBody = ruleBody.slice(5).trim();
  } else if (lowerRule.startsWith('@xpath:') || ruleBody.startsWith('//')) {
    mode = 'xpath';
    ruleBody = lowerRule.startsWith('@xpath:') ? ruleBody.slice(7).trim() : ruleBody;
  } else if (lowerRule.startsWith('@json:') || ruleBody.startsWith('$.') || ruleBody.startsWith('$[')) {
    mode = 'json';
    ruleBody = lowerRule.startsWith('@json:') ? ruleBody.slice(6).trim() : ruleBody;
  } else if (ruleBody.startsWith('@@')) {
    mode = 'css'; // @@ 强制使用CSS（JSoup）
    ruleBody = ruleBody.slice(2).trim();
  } else if (ruleBody.startsWith('/') && !ruleBody.startsWith('//')) {
    // 以/开头但不是//，可能是XPath
    mode = 'xpath';
  } else if (lowerRule.startsWith('@webjs:')) {
    mode = 'webjs';
    ruleBody = ruleBody.slice(7).trim();
  } else if (
    ruleBody.startsWith('@js:') ||
    (/^<js>[\s\S]*<\/js>$/i.test(ruleBody))
  ) {
    mode = 'js';
    if (ruleBody.startsWith('@js:')) {
      ruleBody = ruleBody.slice(4).trim();
    } else {
      // 提取 <js>...</js> 中的内容
      const jsMatch = ruleBody.match(/<js>([\s\S]*?)<\/js>/);
      ruleBody = jsMatch ? jsMatch[1].trim() : ruleBody;
    }
  } else if (/\$\d{1,2}/.test(ruleBody) && !ruleBody.includes('##')) {
    mode = 'regex';
  } else {
    // 默认使用CSS选择器
    mode = 'default';
  }

  return {
    mode,
    ruleBody,
    replacement,
    putMap: Object.keys(putMap).length > 0 ? putMap : undefined,
  };
}

function inferContentType(content: string): 'html' | 'json' | 'text' {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // ignore
    }
  }
  if (trimmed.startsWith('<')) return 'html';
  return 'text';
}

/**
 * 提取@put变量
 */
function extractPutVariables(rule: string, putMap: Record<string, string>): string {
  // 匹配 @put:{"key":"value"} 格式
  const putPattern = /@put:\s*(\{[^}]*\})/g;
  let match;
  let result = rule;

  while ((match = putPattern.exec(rule)) !== null) {
    try {
      const raw = match[1];
      let putObj: Record<string, unknown> | null = null;
      try {
        putObj = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        try {
          // 宽松兼容：允许单引号/未加引号 key 的历史写法
          putObj = Function(`"use strict"; return (${raw});`)() as Record<string, unknown>;
        } catch {
          putObj = null;
        }
      }
      if (!putObj || typeof putObj !== 'object' || Array.isArray(putObj)) {
        throw new Error('invalid @put object');
      }
      Object.assign(putMap, putObj);
      // 移除@put部分
      result = result.replace(match[0], '');
    } catch (e) {
      console.warn('解析@put变量失败:', match[1]);
    }
  }

  return result.trim();
}

/** 模板占位 JSONPath 别名（主路径为空时尝试，如晴天书源 last_update_time → last_chapter_update_time） */
const JSON_TEMPLATE_PATH_ALIASES: Record<string, string[]> = {
  '$.last_update_time': ['$.last_chapter_update_time'],
  '$.update_time': ['$.last_chapter_update_time'],
  /** 晴天等 JSON 条目常用 book_id，模板写 {{$.source}} */
  '$.source': ['$.book_id'],
};

function resolveJsonTemplatePath(pathTrim: string, jsonString: string): string {
  const candidates = [pathTrim, ...(JSON_TEMPLATE_PATH_ALIASES[pathTrim] ?? [])];
  for (const path of candidates) {
    const values = parseJsonPath(path, jsonString);
    const v = values[0];
    if (v != null && String(v).trim() !== '') return String(v);
  }
  return '';
}

/**
 * Legado 模板语法：{{$.path}} 用 JSONPath 结果替换
 * 当规则含 {{ }} 且内容为 JSON 时，不当作 CSS，而是做模板替换
 */
function applyJsonTemplate(rule: string, jsonString: string): string {
  const placeholderRegex = /\{\{(\$[^}]*)\}\}/g;
  return rule.replace(placeholderRegex, (_, path: string) =>
    resolveJsonTemplatePath(path.trim(), jsonString)
  );
}

/**
 * 判断规则是否为 Legado 模板（含 {{$.xxx}}）
 */
function isJsonTemplateRule(rule: string): boolean {
  return /\{\{[\s]*\$[^}]*\}\}/.test(rule);
}

async function expandTemplates(
  rule: string,
  context: RuleContext,
): Promise<string> {
  if (!rule.includes('{{') || !rule.includes('}}')) return rule;
  const templateRegex = /\{\{([\s\S]*?)\}\}/g;
  let expanded = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = templateRegex.exec(rule)) !== null) {
    expanded += rule.slice(lastIndex, match.index);
    const innerExpr = match[1]?.trim() ?? '';
    if (innerExpr) {
      if (isRuleExpression(innerExpr)) {
          let innerResults = await analyzeRule(innerExpr, context);
          // 对齐 legado 容错：当内层混合规则（常见 {{xpath##...}}）失败时，
          // 退化到其主规则部分，避免整段模板直接坍塌为空。
          if (innerResults.length === 0 && innerExpr.includes('##')) {
            const stripped = stripReplacementTail(innerExpr);
            if (stripped && stripped !== innerExpr) {
              innerResults = await analyzeRule(stripped, context);
            }
          }
          expanded += innerResults[0] ?? '';
      } else {
        const jsResult = await evalJs(innerExpr, buildRuleJsContext(context));
        expanded += jsResult == null ? '' : String(jsResult);
      }
    }
    lastIndex = match.index + match[0].length;
  }
  expanded += rule.slice(lastIndex);
  return expanded;
}

/**
 * 用于 JSONPath 时去掉规则末尾的 Legado 提取器（@all、@text、@html 等），
 * 否则如 $.data@all 会被错误传给 JSONPath 导致解析不到数组。
 */
function jsonPathWithoutExtractor(ruleBody: string): string {
  const at = ruleBody.indexOf('@');
  if (at > 0) return ruleBody.substring(0, at).trim();
  return ruleBody;
}

async function runWebJsSegment(
  script: string,
  context: RuleContext,
): Promise<string[]> {
  const sourceRecord = context.source as { bookSourceUrl?: string; header?: string } | undefined;
  const raw = await runWebJs({
    html: context.content,
    url: /^https?:\/\//i.test(context.baseUrl || '') ? context.baseUrl : undefined,
    baseUrl: context.baseUrl,
    script,
    priorResult: context.result || context.content,
    sourceKey: sourceRecord?.bookSourceUrl,
    isRule: true,
    cacheFirst: true,
    timeoutMs: 60_000,
  });
  const list = parseWebJsListResult(raw);
  return list.length > 0 ? list : raw.trim() ? [raw] : [];
}

function decodePossibleJsonArray(input: string): unknown {
  const t = input.trim();
  if (!(t.startsWith('[') && t.endsWith(']'))) return input;
  try {
    const parsed = JSON.parse(t) as unknown;
    return Array.isArray(parsed) ? parsed : input;
  } catch {
    return input;
  }
}

async function prepareRule(
  rule: string,
  context: RuleContext,
): Promise<string> {
  return compileSourceRule(rule, context, {
    regexGroups: context.regexGroups,
    expandTemplate: (inner) => analyzeString(inner, context),
    expandJs: async (js) => {
      const v = await evalJs(js, buildRuleJsContext(context));
      return v == null ? '' : String(v);
    },
  });
}

async function expandReplacementInlineJs(
  input: string,
  context: RuleContext,
  currentResult: string,
): Promise<string> {
  if (!input.includes('<js>')) return input;
  const jsRegex = /<js>([\s\S]*?)<\/js>/gi;
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = jsRegex.exec(input)) !== null) {
    out += input.slice(last, m.index);
    const jsBody = (m[1] ?? '').trim();
    if (jsBody) {
      const jsValue = await evalJs(jsBody, {
        result: currentResult,
        baseUrl: context.baseUrl || '',
        book: context.book,
        source: context.source,
        chapter: context.chapter,
      });
      out += jsValue == null ? '' : String(jsValue);
    }
    last = m.index + m[0].length;
  }
  out += input.slice(last);
  return out;
}

/** 对齐 Legado AnalyzeRule.replaceRegex */
async function applyLegadoReplaceRegex(
  text: string,
  replaceRegex: string,
  replacement: string,
  replaceFirst: boolean,
  context: RuleContext,
): Promise<string> {
  if (!replaceRegex) return text;
  try {
    const replacementContext: RuleContext = {
      ...context,
      result: text,
      content: text,
    };
    const shieldedPattern = shieldInlineReplacementJsInPattern(replaceRegex);
    const compiledPattern = unshieldInlineReplacementJsInPattern(
      await prepareRule(shieldedPattern, replacementContext),
    );
    const compiledReplacement = await prepareRule(replacement, replacementContext);
    const expandedPattern = compiledPattern.replace(/<js>\s*result\s*<\/js>/gi, '');
    const expandedReplacement = await expandReplacementInlineJs(
      compiledReplacement,
      context,
      text,
    );
    const normalizedReplacement = expandedReplacement.replace(/\\#/g, '#');
    if (normalizedReplacement === '#' && !text.includes('|') && /#/.test(text)) {
      const parts = text
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      return parts.map((s) => `#${s.replace(/^#+/, '')}`).join(' ');
    }
    const regex = new RegExp(expandedPattern, 'g');
    if (replaceFirst) {
      const first = text.match(regex)?.[0];
      if (!first) return text;
      return text.replace(first, normalizedReplacement);
    }
    return text.replace(regex, normalizedReplacement);
  } catch (e) {
    console.warn('替换规则执行失败:', replaceRegex, e);
    return text;
  }
}

async function executeRuleByMode(
  mode: RuleMode,
  ruleBody: string,
  context: RuleContext,
): Promise<string[]> {
  switch (mode) {
    case 'css':
      return parseCss(ruleBody, context.content);
    case 'default':
      if (context.contentType === 'json') {
        if (ruleBody.startsWith('$.') || ruleBody.startsWith('$[')) {
          return parseJsonPath(jsonPathWithoutExtractor(ruleBody), context.content);
        }
        // {{$.x}} 模板展开后的元数据（如 已完结,0分,tags）不是 CSS，勿对 JSON 正文做 select
        const literal = ruleBody.trim();
        return literal ? [literal] : [];
      }
      return parseCss(ruleBody, context.content);
    case 'xpath':
      return parseXPath(ruleBody, context.content, context.baseUrl);
    case 'json':
      if (context.contentType !== 'json') return [];
      return parseJsonPath(jsonPathWithoutExtractor(ruleBody), context.content);
    case 'regex':
      return parseRegex(ruleBody, context.content);
    case 'webjs':
      return runWebJsSegment(ruleBody, context);
    case 'js': {
      const jsResult = await evalJs(ruleBody, buildRuleJsContext(context));
      if (jsResult == null) return [];
      if (Array.isArray(jsResult)) {
        return jsResult
          .map((x) => (x == null ? '' : String(x)))
          .filter((x) => x.trim().length > 0);
      }
      const s = String(jsResult);
      return s.trim() ? [s] : [];
    }
    default:
      return [];
  }
}

/**
 * 执行单个 SourceRule（对齐 Legado getStringList 内层循环）
 */
async function executeSourceRuleSegment(
  segment: LegadoSourceRuleSegment,
  context: RuleContext,
): Promise<string[]> {
  const putMap: Record<string, string> = {};
  const rawRule = splitPutRule(segment.ruleStr, putMap);
  if (Object.keys(putMap).length > 0) {
    if (!context.variables) context.variables = {};
    Object.assign(context.variables, putMap);
    for (const [key, valueRule] of Object.entries(putMap)) {
      const resolved = await analyzeString(valueRule, context);
      context.variables[key] = resolved;
    }
  }

  let workingRule = rawRule;
  if (context.contentType !== 'json' && workingRule.includes('{{') && workingRule.includes('}}')) {
    workingRule = await expandTemplates(workingRule, context);
  }
  const jsonLikeContent =
    context.contentType === 'json' ||
    (context.content.trim().startsWith('{') && inferContentType(context.content) === 'json');
  if (jsonLikeContent && isJsonTemplateRule(workingRule)) {
    // 勿对 {{$.x}} 先走 expandJsonInnerRules：内层 {$ 会误匹配，留下单侧 { 如 {vip}
    const result = applyJsonTemplate(workingRule, context.content);
    return result.trim() ? [result] : [];
  }

  const compiled = await prepareRule(workingRule, context);
  const tail = splitLegadoReplaceTail(compiled);
  const mode = detectSourceRuleMode(tail.rule, segment.mode);
  const firstTemplateIdx = segment.ruleStr.indexOf('{{');
  const templatePrefix = firstTemplateIdx >= 0 ? segment.ruleStr.slice(0, firstTemplateIdx) : '';
  // 模板已展开时 workingRule 不再含 {{，仍应把展开结果当字面量（勿再走 parseCss）
  const templateShouldUseLiteralBase =
    context.contentType !== 'json' &&
    segment.ruleStr.includes('{{') &&
    firstTemplateIdx >= 0 &&
    (firstTemplateIdx === 0 || !templatePrefix.includes('##'));
  let results: string[] = [];

  // if (rule.isNotBlank() || sourceRule.replaceRegex.isEmpty())
  if (templateShouldUseLiteralBase && mode === 'default' && tail.rule.trim()) {
    results = [tail.rule];
  } else if (tail.rule.trim() || !tail.replaceRegex) {
    const body = mode === 'regex' && tail.rule.startsWith(':') ? tail.rule.slice(1).trim() : tail.rule;
    results = await executeRuleByMode(mode, body, context);
  } else if (!segment.ruleStr.includes('{{')) {
    const base =
      (typeof context.result === 'string' && context.result) ||
      context.content ||
      '';
    results = base.trim() ? [String(base)] : [];
  } else {
    results = [];
  }

  if (tail.replaceRegex && results.length > 0) {
    results = await Promise.all(
      results.map((r) =>
        applyLegadoReplaceRegex(
          r,
          tail.replaceRegex,
          tail.replacement,
          tail.replaceFirst,
          context,
        ),
      ),
    );
  }

  return results.filter((r) => r && r.trim().length > 0);
}

/**
 * 获取列表元素（书籍列表/目录列表；对齐 Legado getElements）
 * 支持 `:pattern` 全正则模式
 */
export async function analyzeElements(
  rule: string,
  context: RuleContext,
): Promise<string[]> {
  if (!rule?.trim() || !context.content) return [];

  const segments = splitSourceRule(rule, true);
  if (segments.length > 1) {
    let current = context.content;
    let elements: string[] = [];
    for (const seg of segments) {
      if (seg.mode === 'webjs') {
        const sub: RuleContext = { ...context, content: current, result: current };
        const out = await runWebJsSegment(seg.ruleStr, sub);
        if (out.length > 0) {
          elements = out;
          current = elements[0] ?? current;
        }
        continue;
      }
      if (seg.mode === 'js') {
        const jsInput: unknown =
          elements.length > 0 ? elements : decodePossibleJsonArray(current);
        const v = await evalJs(seg.ruleStr, buildRuleJsContext(context, jsInput));
        if (v == null) {
          current = '';
          elements = [];
          continue;
        }
        if (Array.isArray(v)) {
          elements = v.map((x) => (x == null ? '' : String(x))).filter((x) => x.trim().length > 0);
          current = elements[0] ?? '';
        } else {
          current = String(v);
          elements = current.trim() ? [current] : [];
        }
        continue;
      }
      if (elements.length > 0) {
        const merged: string[] = [];
        for (const item of elements) {
          const subCtx: RuleContext = { ...context, content: item, result: item };
          const compiled = await prepareRule(seg.ruleStr, subCtx);
          const next = await analyzeElements(compiled, subCtx);
          merged.push(...next);
        }
        elements = merged.filter((e) => e.trim());
      } else {
        const compiled = await prepareRule(seg.ruleStr, { ...context, content: current, result: current });
        const next = await analyzeElements(compiled, { ...context, content: current, result: current });
        elements = next;
      }
      if (elements.length > 0) current = elements[0];
    }
    return elements.filter((e) => e.trim());
  }

  let compiled = await prepareRule(rule, context);
  const trimmed = compiled.trim();
  const regexBody = trimmed.startsWith(':') ? trimmed.slice(1).trim() : trimmed;
  const isColonRegex = trimmed.startsWith(':');

  if (isColonRegex || (parseRule(compiled).mode === 'regex' && !trimmed.includes('@'))) {
    const groupsList = getRegexElements(regexBody, context.content);
    return groupsList
      .map((g) => regexGroupsToElementContent(g))
      .filter((s) => s.trim().length > 0);
  }

  const directList = selectElementsOuterHtml(compiled, context.content);
  if (directList.length > 0) {
    return directList;
  }

  let listRule = compiled;
  if (!listRule.includes('@')) {
    listRule = `${listRule}@all`;
  }
  const viaRule = await analyzeRule(listRule, context);
  if (viaRule.length > 1) {
    return viaRule;
  }

  const retryDirect = selectElementsOuterHtml(listRule, context.content);
  return retryDirect.length > 0 ? retryDirect : viaRule;
}

/**
 * 执行规则解析
 */
export async function analyzeRule(
  rule: string,
  context: RuleContext
): Promise<string[]> {
  if (!rule || !context.content) {
    return [];
  }

  const segments = splitSourceRule(rule);
  if (segments.length === 0) return [];

  let currentContent = context.content;
  let currentType = context.contentType ?? inferContentType(currentContent);
  let lastResults: string[] = [];

  for (const seg of segments) {
    const subContext: RuleContext = {
      ...context,
      content: currentContent,
      contentType: currentType,
      result: currentContent,
    };
    lastResults = await executeSourceRuleSegment(seg, subContext);
    if (lastResults.length > 0) {
      currentContent = lastResults.join('\n');
      currentType = inferContentType(currentContent);
    }
  }

  return lastResults.filter((r) => r && r.trim().length > 0);
}

/**
 * 获取单个字符串结果
 * - 默认：多元素 join('\n')（对齐 Legado getString）
 * - isUrl：仅首个非空（对齐 getString0 / tocUrl）
 */
export async function analyzeString(
  rule: string,
  context: RuleContext,
  options?: AnalyzeStringOptions,
): Promise<string> {
  const trimmed = rule.trim();
  if (!trimmed) return '';

  const { parts, op } = splitRuleByOperators(trimmed);
  if (op === '||' && parts.length > 1) {
    for (const part of parts) {
      const results = await analyzeRule(part, context);
      const hit = results.find((r) => r?.trim());
      if (hit) return hit.trim();
    }
    return '';
  }

  const results = await analyzeRule(trimmed, context);
  const nonEmpty = results.filter((r) => r && r.trim().length > 0);
  if (nonEmpty.length === 0) return '';

  if (options?.isUrl) {
    return nonEmpty[0].trim();
  }
  if (nonEmpty.length === 1) return nonEmpty[0];
  return nonEmpty.join('\n');
}

/**
 * 获取字符串列表结果
 */
export interface ListElementItem {
  content: string;
  regexGroups?: string[];
  rawValue?: unknown;
}

/** 书籍/目录列表项（保留正则捕获组供 $1/$2 字段规则使用） */
export async function analyzeListElements(
  rule: string,
  context: RuleContext,
): Promise<ListElementItem[]> {
  const compiled = await prepareRule(rule, context);
  const trimmed = compiled.trim();
  const regexBody = trimmed.startsWith(':') ? trimmed.slice(1).trim() : trimmed;
  const isColonRegex = trimmed.startsWith(':');

  if (isColonRegex || (parseRule(compiled).mode === 'regex' && !trimmed.includes('@'))) {
    return getRegexElements(regexBody, context.content)
      .map((groups) => ({
        content: regexGroupsToElementContent(groups),
        regexGroups: groups,
        rawValue: groups,
      }))
      .filter((item) => item.content.trim().length > 0);
  }

  const strings = await analyzeElements(compiled, context);
  return strings.map((content) => ({ content, rawValue: content }));
}

export async function analyzeStringList(
  rule: string,
  context: RuleContext
): Promise<string[]> {
  const items = await analyzeListElements(rule, context);
  return items.map((i) => i.content);
}
