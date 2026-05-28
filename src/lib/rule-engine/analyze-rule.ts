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

import { parseCss } from '@/lib/rule-engine/css-parser';
import { parseXPath } from '@/lib/rule-engine/xpath-parser';
import { parseJsonPath } from '@/lib/rule-engine/jsonpath-parser';
import {
  getRegexElements,
  parseRegex,
  regexGroupsToElementContent,
} from '@/lib/rule-engine/regex-parser';
import { compileSourceRule, stripReplacementTail } from '@/lib/rule-engine/source-rule';
import { evalJs } from '@/lib/js-engine';
import { RuleAnalyzer } from '@/lib/rule-engine/rule-analyzer';
import { parseWebJsListResult, runWebJs } from '@/lib/rule-engine/webjs-runner';
import { isRuleExpression } from '@/lib/rule-engine/rule-expression';

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
  /** 上一步结果 */
  result?: string;
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

/** 拆分 <js> / @js: / @webjs: 片段（对齐 Legado splitSourceRule） */
function splitSourceRuleSegments(ruleStr: string): Array<{ text: string; mode: 'js' | 'webjs' | 'default' }> {
  const findInlineScriptEnd = (start: number): number => {
    const tail = ruleStr.slice(start);
    const m = tail.search(/(?:&&|\|\||%%)|<js>|@js:|@webjs:/i);
    return m < 0 ? ruleStr.length : start + m;
  };
  const out: Array<{ text: string; mode: 'js' | 'webjs' | 'default' }> = [];
  const lower = ruleStr.toLowerCase();
  let i = 0;

  while (i < ruleStr.length) {
    const jsTagIdx = lower.indexOf('<js>', i);
    const jsPrefixIdx = lower.indexOf('@js:', i);
    const webJsIdx = lower.indexOf('@webjs:', i);

    const candidates = [jsTagIdx, jsPrefixIdx, webJsIdx].filter((x) => x >= 0);
    if (candidates.length === 0) {
      const tail = ruleStr.slice(i).trim();
      if (tail) out.push({ text: tail, mode: 'default' });
      break;
    }

    const nextIdx = Math.min(...candidates);
    if (nextIdx > i) {
      const pre = ruleStr.slice(i, nextIdx).trim();
      if (pre) out.push({ text: pre, mode: 'default' });
    }

    if (nextIdx === jsTagIdx) {
      const closeIdx = lower.indexOf('</js>', jsTagIdx + 4);
      const end = closeIdx >= 0 ? closeIdx + 5 : ruleStr.length;
      const body = ruleStr.slice(jsTagIdx + 4, closeIdx >= 0 ? closeIdx : ruleStr.length).trim();
      out.push({ text: body, mode: 'js' });
      i = end;
      continue;
    }

    if (nextIdx === webJsIdx) {
      const end = findInlineScriptEnd(webJsIdx + 7);
      const body = ruleStr.slice(webJsIdx + 7, end).trim();
      if (body) out.push({ text: body, mode: 'webjs' });
      i = end;
      continue;
    }

    if (nextIdx === jsPrefixIdx) {
      const end = findInlineScriptEnd(jsPrefixIdx + 4);
      const body = ruleStr.slice(jsPrefixIdx + 4, end).trim();
      if (body) out.push({ text: body, mode: 'js' });
      i = end;
      continue;
    }

    i = nextIdx + 1;
  }
  return out.length > 0 ? out : [{ text: ruleStr.trim(), mode: 'default' }];
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
        const jsResult = await evalJs(innerExpr, {
          result: context.result || context.content,
          baseUrl: context.baseUrl || '',
          book: context.book,
          source: context.source,
          chapter: context.chapter,
        });
        expanded += jsResult == null ? '' : String(jsResult);
      }
    }
    lastIndex = match.index + match[0].length;
  }
  expanded += rule.slice(lastIndex);
  return expanded;
}

function expandJsonInnerRules(rule: string, jsonString: string): string {
  const analyzer = new RuleAnalyzer(rule, true);
  const expanded = analyzer.innerRule('{$.', 2, 1, (inner) => {
    const values = parseJsonPath(inner.trim(), jsonString);
    const v = values.join('\n');
    return v || null;
  });
  return expanded || rule;
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
      const v = await evalJs(js, {
        result: context.result || context.content,
        baseUrl: context.baseUrl || '',
        book: context.book,
        source: context.source,
        chapter: context.chapter,
      });
      return v == null ? '' : String(v);
    },
  });
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

  const segments = splitSourceRuleSegments(rule);
  if (segments.length > 1) {
    let current = context.content;
    let elements: string[] = [];
    for (const seg of segments) {
      if (seg.mode === 'webjs') {
        const sub: RuleContext = { ...context, content: current, result: current };
        const out = await runWebJsSegment(seg.text, sub);
        if (out.length > 0) {
          elements = out;
          current = elements[0] ?? current;
        }
        continue;
      }
      if (seg.mode === 'js') {
        const jsInput: unknown =
          elements.length > 0 ? elements : decodePossibleJsonArray(current);
        const v = await evalJs(seg.text, {
          result: jsInput,
          baseUrl: context.baseUrl || '',
          book: context.book,
          source: context.source,
          chapter: context.chapter,
        });
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
          const compiled = await prepareRule(seg.text, subCtx);
          const next = await analyzeElements(compiled, subCtx);
          merged.push(...next);
        }
        elements = merged.filter((e) => e.trim());
      } else {
        const compiled = await prepareRule(seg.text, { ...context, content: current, result: current });
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

  let listRule = compiled;
  if (!listRule.includes('@')) {
    listRule = `${listRule}@all`;
  }
  return analyzeRule(listRule, context);
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

  // 顶层先按原始规则拆分；replace tail 已支持上下文感知，不会误拆 {{}} / <js> 内部 ##。
  // 编译（@get/{{}}/$N）在具体段执行阶段进行，避免提前编译改变 rule mode 判定。
  const topLevelParsed = parseRule(rule);
  const hadOriginalRuleBody = topLevelParsed.ruleBody.trim().length > 0;

  // 对齐 Legado putRule 时序：在当前 SourceRule 执行前写入变量（基于编译后规则）。
  if (topLevelParsed.putMap) {
    if (!context.variables) context.variables = {};
    for (const [key, valueRule] of Object.entries(topLevelParsed.putMap)) {
      const resolved = await analyzeString(valueRule, context);
      context.variables[key] = resolved;
      if (key.startsWith('book.') && context.book) {
        context.book[key.slice(5)] = resolved;
      } else if (key.startsWith('chapter.') && context.chapter) {
        context.chapter[key.slice(8)] = resolved;
      } else if (key.startsWith('source.') && context.source) {
        context.source[key.slice(7)] = resolved;
      }
    }
  }

  // Legado：先按“原始规则串”切分 <js> / @js: 片段，再逐段执行。
  // 这样 replaceRegex 中内嵌 <js>（例如 "##.*\\|<js>result</js>##\\#"）也能按 legado 语义生效。
  const segments = splitSourceRuleSegments(rule);
  if (segments.length > 1) {
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
      if (seg.mode === 'webjs') {
        lastResults = await runWebJsSegment(seg.text, subContext);
        currentContent = lastResults.join('\n');
        currentType = inferContentType(currentContent);
        continue;
      }
      if (seg.mode === 'js') {
        const jsResult = await evalJs(seg.text, {
          result: subContext.result || subContext.content,
          baseUrl: subContext.baseUrl || '',
          book: subContext.book,
          source: subContext.source,
          chapter: subContext.chapter,
        });
        if (Array.isArray(jsResult)) {
          const normalized = jsResult
            .map((x) => (x == null ? '' : String(x)))
            .filter((x) => x.trim().length > 0);
          currentContent = normalized.join('\n');
          currentType = inferContentType(currentContent);
          lastResults = normalized;
        } else {
          currentContent = jsResult == null ? '' : String(jsResult);
          currentType = inferContentType(currentContent);
          lastResults = currentContent.trim() ? [currentContent] : [];
        }
        continue;
      }
      lastResults = await analyzeRule(seg.text, subContext);
      if (lastResults.length > 0) {
        currentContent = lastResults.join('\n');
        currentType = inferContentType(currentContent);
      }
    }
    let mixedResults = lastResults.filter((r) => r && r.trim().length > 0);
    if (topLevelParsed.replacement && mixedResults.length > 0) {
      mixedResults = await Promise.all(
        mixedResults.map((r) => applyReplacement(r, topLevelParsed.replacement!, context)),
      );
    }
    return mixedResults.filter((r) => r && r.trim().length > 0);
  }

  const hadTemplateBeforeExpand = context.contentType !== 'json' && rule.includes('{{') && rule.includes('}}');
  // 对齐 Legado SourceRule:
  // 当规则前段包含 {{...}} 求值且其前缀为空/不含 ## 时，会按“文本+replace”路径处理，
  // 不应把求值后的文本再当 CSS 选择器解析。
  const firstTemplateIdx = rule.indexOf('{{');
  const templatePrefix = firstTemplateIdx >= 0 ? rule.slice(0, firstTemplateIdx) : '';
  const templateShouldUseLiteralBase =
    hadTemplateBeforeExpand &&
    firstTemplateIdx >= 0 &&
    (firstTemplateIdx === 0 || !templatePrefix.includes('##'));

  // Legado 模板：{{$.path}} 等，在 JSON 上下文中按模板替换，避免被误判为 CSS
  if (context.contentType === 'json' && isJsonTemplateRule(rule)) {
    const expanded = expandJsonInnerRules(rule, context.content);
    const result = applyJsonTemplate(expanded, context.content);
    return result.trim() ? [result] : [];
  }

  // 非 JSON 场景：展开 {{...}}（规则表达式按规则执行；否则按 JS 求值）
  if (context.contentType !== 'json' && rule.includes('{{') && rule.includes('}}')) {
    rule = await expandTemplates(rule, context);
  }

  rule = await prepareRule(rule, context);

  // 关键修复：模板/变量展开后，规则模式可能从 default 变成 xpath/json/js。
  // 必须使用“编译后规则”重新判定 mode，避免 {{//...}} 被误路由到 CSS。
  const parsed = parseRule(rule);
  let results: string[] = [];

  // 对齐 Legado 边界：当主规则为空但存在 ## 替换时，
  // 不执行选择器/脚本，而是直接对“当前结果”应用替换。
  // Kotlin 条件对应：
  // if (rule.isNotBlank() || sourceRule.replaceRegex.isEmpty()) { ... } else { skip 执行 }
  // 随后若 replaceRegex 非空则对现有 result 执行 replaceRegex。
  if (!parsed.ruleBody.trim() && parsed.replacement && !hadOriginalRuleBody) {
    const base =
      (typeof context.result === 'string' && context.result) ||
      context.content ||
      '';
    results = base ? [String(base)] : [];
  } else if (templateShouldUseLiteralBase && parsed.mode === 'default') {
    const literal = parsed.ruleBody.trim();
    results = literal ? [literal] : [];
  } else {

    // 根据模式调用相应的解析器
    switch (parsed.mode) {
      case 'css':
        results = parseCss(parsed.ruleBody, context.content);
        break;

      case 'default':
        // 未显式指定模式时：若内容为 JSON 且规则像 JSONPath 则用 json
        if (context.contentType === 'json' && (parsed.ruleBody.startsWith('$.') || parsed.ruleBody.startsWith('$['))) {
          results = parseJsonPath(jsonPathWithoutExtractor(parsed.ruleBody), context.content);
        } else {
          results = parseCss(parsed.ruleBody, context.content);
        }
        break;

      case 'xpath':
        results = parseXPath(parsed.ruleBody, context.content, context.baseUrl);
        break;

      case 'json':
        if (context.contentType !== 'json') {
          results = [];
        } else {
          results = parseJsonPath(jsonPathWithoutExtractor(parsed.ruleBody), context.content);
        }
        break;

      case 'regex':
        results = parseRegex(parsed.ruleBody, context.content);
        break;

      case 'webjs': {
        results = await runWebJsSegment(parsed.ruleBody, context);
        break;
      }

      case 'js': {
        const jsResult = await evalJs(parsed.ruleBody, {
          result: context.result || context.content,
          baseUrl: context.baseUrl || '',
          book: context.book,
          source: context.source,
          chapter: context.chapter,
        });
        results = jsResult == null ? [] : [String(jsResult)];
        break;
      }
    }
  }

  // 应用替换规则
  if (parsed.replacement && results.length > 0) {
    results = await Promise.all(
      results.map((r) => applyReplacement(r, parsed.replacement!, context)),
    );
  }

  // 对齐 legado 模板场景：当规则由 {{...}} 展开成纯文本时，不应再强行走 CSS 选择器。
  if (
    results.length === 0 &&
    hadTemplateBeforeExpand &&
    parsed.mode === 'default' &&
    parsed.ruleBody.trim().length > 0
  ) {
    results = [parsed.ruleBody];
  }

  // 过滤空结果
  return results.filter(r => r && r.trim().length > 0);
}

/**
 * 应用替换规则
 */
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

async function applyReplacement(
  text: string,
  replacement: NonNullable<ParsedRule['replacement']>,
  context: RuleContext,
): Promise<string> {
  try {
    const replacementContext: RuleContext = {
      ...context,
      result: text,
      content: text,
    };
    const compiledPattern = await prepareRule(replacement.pattern, replacementContext);
    const compiledReplacement = await prepareRule(replacement.replacement, replacementContext);
    // 对齐 Legado：replaceRegex 部分不执行 <js>，历史书源中常见
    // `##.*\\|<js>result</js>##\\#` 依赖此行为避免把当前结果注入正则。
    const expandedPattern = compiledPattern.replace(/<js>[\s\S]*?<\/js>/gi, '');
    const expandedReplacement = await expandReplacementInlineJs(
      compiledReplacement,
      context,
      text,
    );
    const normalizedReplacement = expandedReplacement.replace(/\\#/g, '#');
    const regex = new RegExp(expandedPattern, 'g');
    if (!replacement.replaceFirst) {
      return text.replace(regex, normalizedReplacement);
    }
    const first = text.match(regex)?.[0];
    if (!first) return text;
    return text.replace(first, normalizedReplacement);
  } catch (e) {
    console.warn('替换规则执行失败:', replacement.pattern, e);
    return text;
  }
}

/**
 * 获取单个字符串结果（取第一个）
 */
export async function analyzeString(
  rule: string,
  context: RuleContext
): Promise<string> {
  const results = await analyzeRule(rule, context);
  if (results.length === 0) return '';
  if (results.length === 1) return results[0] || '';
  return results.filter((r) => r && r.length > 0).join('\n');
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
