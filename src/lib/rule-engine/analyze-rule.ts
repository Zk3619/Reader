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

import { parseCss } from './css-parser';
import { parseXPath } from './xpath-parser';
import { parseJsonPath } from './jsonpath-parser';
import { parseRegex } from './regex-parser';
import { evalJs } from './js-sandbox';

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

  // 1. 提取替换规则（##正则##替换 或 ##正则##替换###）
  const replaceMatch = rule.match(/##(.+?)##(.*?)(###)?$/);
  if (replaceMatch) {
    ruleBody = rule.substring(0, rule.indexOf('##')).trim();
    replacement = {
      pattern: replaceMatch[1],
      replacement: replaceMatch[2] ?? '',
      replaceFirst: replaceMatch[3] === '###',
    };
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
  } else if (ruleBody.includes('<js>') || ruleBody.startsWith('@js:')) {
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

/**
 * Legado 模板语法：{{$.path}} 用 JSONPath 结果替换
 * 当规则含 {{ }} 且内容为 JSON 时，不当作 CSS，而是做模板替换
 */
function applyJsonTemplate(rule: string, jsonString: string): string {
  const placeholderRegex = /\{\{(\$[^}]*)\}\}/g;
  return rule.replace(placeholderRegex, (_, path: string) => {
    const pathTrim = path.trim();
    const values = parseJsonPath(pathTrim, jsonString);
    return values[0] ?? '';
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

  // Legado 模板：{{$.path}} 等，在 JSON 上下文中按模板替换，避免被误判为 CSS
  if (context.contentType === 'json' && isJsonTemplateRule(rule)) {
    const result = applyJsonTemplate(rule, context.content);
    return result.trim() ? [result] : [];
  }

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
      results = parseJsonPath(jsonPathWithoutExtractor(parsed.ruleBody), context.content);
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
