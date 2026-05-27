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
import { parseRegex } from '@/lib/rule-engine/regex-parser';
import { evalJs } from '@/lib/js-engine';

/**
 * 规则模式
 */
export type RuleMode = 'css' | 'xpath' | 'json' | 'regex' | 'js' | 'default';

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

  // 1. 提取替换规则
  // 兼容以下 Legado 常见写法：
  // - rule##regex##replacement
  // - rule##regex##replacement###
  // - rule##regex      (仅删除匹配项，replacement 为空)
  const firstSharp = rule.indexOf('##');
  if (firstSharp >= 0) {
    ruleBody = rule.substring(0, firstSharp).trim();
    const tail = rule.substring(firstSharp + 2);
    const secondSharp = tail.indexOf('##');
    if (secondSharp >= 0) {
      const pattern = tail.substring(0, secondSharp);
      let replacementPart = tail.substring(secondSharp + 2);
      const replaceFirst = replacementPart.endsWith('###');
      if (replaceFirst) replacementPart = replacementPart.slice(0, -3);
      replacement = {
        pattern,
        replacement: replacementPart ?? '',
        replaceFirst,
      };
    } else {
      replacement = {
        pattern: tail,
        replacement: '',
      };
    }
  }

  // 2. 提取@put变量
  ruleBody = extractPutVariables(ruleBody, putMap);

  // 3. 检测解析模式
  const lowerRule = ruleBody.toLowerCase();

  if (lowerRule.startsWith('@css:')) {
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

function splitTopLevelAlternatives(rule: string, separator: '||' | '&&'): string[] {
  const out: string[] = [];
  let quote: "'" | '"' | null = null;
  let brace = 0;
  let i = 0;
  let start = 0;
  while (i < rule.length) {
    const c = rule[i];
    if (quote) {
      if (c === quote && rule[i - 1] !== '\\') quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      i += 1;
      continue;
    }
    if (c === '{') brace += 1;
    if (c === '}') brace = Math.max(0, brace - 1);
    if (brace === 0 && rule.slice(i, i + separator.length) === separator) {
      const seg = rule.slice(start, i).trim();
      if (seg) out.push(seg);
      i += separator.length;
      start = i;
      continue;
    }
    i += 1;
  }
  const tail = rule.slice(start).trim();
  if (tail) out.push(tail);
  return out;
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
      const putObj = JSON.parse(match[1]);
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

function applyGetVariables(rule: string, context: RuleContext): string {
  if (!rule.includes('@get:{')) return rule;
  return rule.replace(/@get:\{([^}]+)\}/gi, (_m, key: string) => {
    const k = key.trim();
    const v = context.variables?.[k];
    return v == null ? '' : String(v);
  });
}

/**
 * 判断规则是否为 Legado 模板（含 {{$.xxx}}）
 */
function isJsonTemplateRule(rule: string): boolean {
  return /\{\{[\s]*\$[^}]*\}\}/.test(rule);
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

  // 兼容 Legado “A||B” 备选规则：前者为空时回退后者
  const alternatives = splitTopLevelAlternatives(rule, '||');
  if (alternatives.length > 1) {
    for (const alt of alternatives) {
      const r = await analyzeRule(alt, context);
      if (r.length > 0) return r;
    }
    return [];
  }

  // 兼容 Legado “A&&B” 串联规则：前一步结果作为后一步输入
  const chainRules = splitTopLevelAlternatives(rule, '&&');
  if (chainRules.length > 1) {
    let current: string[] = [context.content];
    for (const part of chainRules) {
      const next: string[] = [];
      for (const item of current) {
        const itemStr = String(item ?? '');
        if (!itemStr) continue;
        const subContext: RuleContext = {
          ...context,
          content: itemStr,
          contentType: inferContentType(itemStr),
          result: itemStr,
        };
        const out = await analyzeRule(part, subContext);
        if (out.length > 0) next.push(...out);
      }
      current = next;
      if (current.length === 0) break;
    }
    return current;
  }

  // Legado 模板：{{$.path}} 等，在 JSON 上下文中按模板替换，避免被误判为 CSS
  if (context.contentType === 'json' && isJsonTemplateRule(rule)) {
    const result = applyJsonTemplate(rule, context.content);
    return result.trim() ? [result] : [];
  }

  // 非 JSON 场景：先展开 {{...}} 内部规则（可嵌 XPath/CSS/JS 与 ## 替换）
  if (context.contentType !== 'json' && rule.includes('{{') && rule.includes('}}')) {
    const templateRegex = /\{\{([\s\S]*?)\}\}/g;
    let expanded = '';
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = templateRegex.exec(rule)) !== null) {
      expanded += rule.slice(lastIndex, match.index);
      const innerRule = match[1]?.trim() ?? '';
      if (innerRule) {
        const innerResults = await analyzeRule(innerRule, context);
        expanded += innerResults[0] ?? '';
      }
      lastIndex = match.index + match[0].length;
    }
    expanded += rule.slice(lastIndex);
    rule = expanded;
  }

  // 兼容 Legado 变量读取：@get:{key}
  rule = applyGetVariables(rule, context);

  const parsed = parseRule(rule);
  let results: string[] = [];

  // 根据模式调用相应的解析器
  switch (parsed.mode) {
    case 'css':
      results = parseCss(parsed.ruleBody, context.content);
      break;

    case 'default':
      // 未显式指定模式时：若内容为 JSON 且规则含 {{ }}，按模板处理（上面已处理）；否则若规则像 JSONPath 则用 json
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

    case 'js':
      const jsResult = await evalJs(parsed.ruleBody, {
        result: context.result || context.content,
        baseUrl: context.baseUrl || '',
        book: context.book,
        source: context.source,
        chapter: context.chapter,
      });
      results = jsResult ? [jsResult] : [];
      break;
  }

  // 应用替换规则
  if (parsed.replacement && results.length > 0) {
    results = results.map(r => applyReplacement(r, parsed.replacement!));
  }

  // 保存@put变量到上下文
  if (parsed.putMap && context.variables) {
    Object.assign(context.variables, parsed.putMap);
  }

  // 过滤空结果
  return results.filter(r => r && r.trim().length > 0);
}

/**
 * 应用替换规则
 */
function applyReplacement(
  text: string,
  replacement: NonNullable<ParsedRule['replacement']>
): string {
  try {
    const regex = new RegExp(replacement.pattern, replacement.replaceFirst ? '' : 'g');
    return text.replace(regex, replacement.replacement);
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
  return results[0] || '';
}

/**
 * 获取字符串列表结果
 */
export async function analyzeStringList(
  rule: string,
  context: RuleContext
): Promise<string[]> {
  return analyzeRule(rule, context);
}
