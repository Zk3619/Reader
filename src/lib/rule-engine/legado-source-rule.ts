/**
 * Legado AnalyzeRule.splitSourceRule / SourceRule 初始化语义
 * 对应 AnalyzeRule.kt + AppPattern.JS_PATTERN / WebJS_PATTERN
 */

import type { RuleMode } from '@/lib/rule-engine/analyze-rule';

/** 与 Legado AppPattern.JS_PATTERN 一致 */
const JS_PATTERN = /<js>([\s\S]*?)<\/js>|@js:([\s\S]*)/gi;
/** 与 Legado AppPattern.WebJS_PATTERN 一致（至少 5 字符脚本） */
const WEBJS_PATTERN = /@webjs:([\s\S]{5,})/gi;
/** ## 替换正则里的内联占位，不是独立 <js> 段（如 ##.*\|<js>result</js>##） */
const INLINE_REPLACEMENT_JS_RESULT = /<js>\s*result\s*<\/js>/gi;
const INLINE_REPLACEMENT_JS_RESULT_PLACEHOLDER = '@@LEGADO_INLINE_JS_RESULT@@';

function shieldInlineReplacementJs(ruleStr: string): string {
  return ruleStr.replace(INLINE_REPLACEMENT_JS_RESULT, INLINE_REPLACEMENT_JS_RESULT_PLACEHOLDER);
}

function unshieldInlineReplacementJs(ruleStr: string): string {
  return ruleStr.split(INLINE_REPLACEMENT_JS_RESULT_PLACEHOLDER).join('<js>result</js>');
}

/** 供 replaceRegex 编译前保留内联 <js>result</js> 占位 */
export function shieldInlineReplacementJsInPattern(pattern: string): string {
  return shieldInlineReplacementJs(pattern);
}

export function unshieldInlineReplacementJsInPattern(pattern: string): string {
  return unshieldInlineReplacementJs(pattern);
}

export interface LegadoSourceRuleSegment {
  mode: RuleMode;
  /** 原始片段（尚未 makeUpRule） */
  ruleStr: string;
}

/** 无 <js> 包裹时仍应走 Js 模式（避免被 default/CSS 解析） */
export function isLikelyJavaScriptRule(ruleStr: string): boolean {
  const t = ruleStr.trim();
  if (!t) return false;
  if (/^<js[\s>]/i.test(t)) return true;
  if (/^@js:/i.test(t)) return true;
  if (/^\s*(let|const|var|function)\s+/.test(t)) return true;
  if (/\bjava\.(get|put|base64Encode|base64Decode|ajax|toast)\b/.test(t)) return true;
  if (/`[\s\S]*\$\{[\s\S]*\}`/.test(t)) return true;
  if (/\bresult\.[a-zA-Z_$][\w$]*/.test(t) && /[;{}]/.test(t)) return true;
  return false;
}

export function splitPutRule(rule: string, putMap: Record<string, string>): string {
  const putPattern = /@put:\s*(\{[^}]*\})/gi;
  let result = rule;
  let match: RegExpExecArray | null;
  putPattern.lastIndex = 0;
  while ((match = putPattern.exec(rule)) !== null) {
    try {
      const raw = match[1];
      let putObj: Record<string, unknown> | null = null;
      try {
        putObj = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        try {
          putObj = Function(`"use strict"; return (${raw});`)() as Record<string, unknown>;
        } catch {
          putObj = null;
        }
      }
      if (putObj && typeof putObj === 'object' && !Array.isArray(putObj)) {
        Object.assign(putMap, putObj);
      }
      result = result.replace(match[0], '');
    } catch {
      // ignore
    }
  }
  return result.trim();
}

/**
 * 分解规则（对齐 Legado splitSourceRule）
 * @param allInOne 列表规则以 `:` 开头时整段走 Regex（getElement/getElements）
 */
export function splitSourceRule(ruleStr: string, allInOne = false): LegadoSourceRuleSegment[] {
  if (!ruleStr?.trim()) return [];

  const shielded = shieldInlineReplacementJs(ruleStr);
  const ruleList: LegadoSourceRuleSegment[] = [];
  let mode: RuleMode = 'default';
  let start = 0;

  if (allInOne && shielded.startsWith(':')) {
    mode = 'regex';
    start = 1;
  }

  const addDefault = (text: string) => {
    const tmp = unshieldInlineReplacementJs(text).trim();
    if (tmp) ruleList.push({ mode, ruleStr: tmp });
  };

  JS_PATTERN.lastIndex = 0;
  let jsMatch: RegExpExecArray | null;
  while ((jsMatch = JS_PATTERN.exec(shielded)) !== null) {
    if (jsMatch.index > start) {
      addDefault(shielded.slice(start, jsMatch.index));
    }
    const body = (jsMatch[2] ?? jsMatch[1] ?? '').trim();
    if (body) ruleList.push({ mode: 'js', ruleStr: body });
    start = jsMatch.index + jsMatch[0].length;
  }

  WEBJS_PATTERN.lastIndex = 0;
  let webMatch: RegExpExecArray | null;
  while ((webMatch = WEBJS_PATTERN.exec(shielded)) !== null) {
    if (webMatch.index > start) {
      addDefault(shielded.slice(start, webMatch.index));
    }
    const body = (webMatch[1] ?? '').trim();
    if (body) ruleList.push({ mode: 'webjs', ruleStr: body });
    start = webMatch.index + webMatch[0].length;
  }

  if (shielded.length > start) {
    addDefault(shielded.slice(start));
  }

  const plain = unshieldInlineReplacementJs(ruleStr).trim();
  if (ruleList.length === 1 && ruleList[0].mode === 'default' && isLikelyJavaScriptRule(ruleList[0].ruleStr)) {
    ruleList[0] = { mode: 'js', ruleStr: ruleList[0].ruleStr };
  } else if (ruleList.length === 0 && isLikelyJavaScriptRule(plain)) {
    ruleList.push({ mode: 'js', ruleStr: plain });
  }

  return ruleList;
}

/** 从 ## 中分离主规则与替换段（忽略 {{}} / <js> 内的 ##） */
export function stripReplacementTail(rule: string): string {
  const text = rule.trim();
  if (!text.includes('##')) return text;
  let inSingle = false;
  let inDouble = false;
  let templateDepth = 0;
  let inJsBlock = false;
  for (let i = 0; i < text.length - 1; i += 1) {
    const ch = text[i]!;
    const next = text[i + 1]!;
    if (!inSingle && !inDouble) {
      if (!inJsBlock && text.slice(i, i + 4).toLowerCase() === '<js>') {
        inJsBlock = true;
        i += 3;
        continue;
      }
      if (inJsBlock && text.slice(i, i + 5).toLowerCase() === '</js>') {
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
      if (ch === "'" && !inDouble && text[i - 1] !== '\\') inSingle = !inSingle;
      else if (ch === '"' && !inSingle && text[i - 1] !== '\\') inDouble = !inDouble;
      if (!inSingle && !inDouble && ch === '#' && next === '#') {
        return text.slice(0, i).trim();
      }
    }
  }
  return text;
}

/** makeUpRule 末尾按 ## 切分（对齐 Legado SourceRule.makeUpRule） */
export function splitLegadoReplaceTail(rule: string): {
  rule: string;
  replaceRegex: string;
  replacement: string;
  replaceFirst: boolean;
} {
  const trimmed = rule.trim();
  if (!trimmed.includes('##')) {
    return { rule: trimmed, replaceRegex: '', replacement: '', replaceFirst: false };
  }
  const mainRule = stripReplacementTail(trimmed);
  const tailStart = trimmed.indexOf(mainRule) + mainRule.length;
  const tailRaw = trimmed.slice(tailStart).replace(/^\s*##\s*/, '');
  if (!tailRaw) {
    return { rule: mainRule.trim(), replaceRegex: '', replacement: '', replaceFirst: false };
  }
  const tailParts = tailRaw.split('##');
  return {
    rule: mainRule.trim(),
    replaceRegex: (tailParts[0] ?? '').trim(),
    replacement: tailParts[1] ?? '',
    replaceFirst: tailParts.length > 2,
  };
}

/**
 * 识别解析模式（对齐 Legado SourceRule init，不含 Js/Regex 特例）
 */
export function detectSourceRuleMode(ruleStr: string, preset?: RuleMode): RuleMode {
  if (preset === 'js' || preset === 'webjs' || preset === 'regex') return preset;
  if (ruleStr.startsWith(':')) return 'regex';

  const lower = ruleStr.toLowerCase();
  if (lower.startsWith('@css:')) return 'css';
  if (lower.startsWith('@@')) return 'css';
  if (lower.startsWith('@xpath:')) return 'xpath';
  if (lower.startsWith('@json:')) return 'json';
  if (lower.startsWith('@webjs:')) return 'webjs';
  if (lower.startsWith('@js:')) return 'js';
  if (isLikelyJavaScriptRule(ruleStr)) return 'js';
  if (ruleStr.startsWith('//')) return 'xpath';
  if (ruleStr.startsWith('$.') || ruleStr.startsWith('$[')) return 'json';
  if (ruleStr.startsWith('/') && !ruleStr.startsWith('//')) return 'xpath';
  return 'default';
}
