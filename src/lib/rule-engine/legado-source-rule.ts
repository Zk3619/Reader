/**
 * Legado AnalyzeRule.splitSourceRule / SourceRule 初始化语义
 * 对应 AnalyzeRule.kt + AppPattern.JS_PATTERN / WebJS_PATTERN
 */

import type { RuleMode } from '@/lib/rule-engine/analyze-rule';

/** 与 Legado AppPattern.JS_PATTERN 一致（<js> 段）；@js: 另用 scanAtJsRule 避免吞掉后续 && 链 */
const JS_PATTERN = /<js>([\s\S]*?)<\/js>/gi;
/** 与 Legado AppPattern.WebJS_PATTERN 一致（@webjs: 在 webjs-runner 中处理） */
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
  /** splitSourceRule 暂存：@js: 与 <js> 在拼接 ## 替换尾时需还原外壳 */
  jsWrap?: 'atjs' | 'wrapped';
}

/**
 * 剥离 Legado @js: / <js></js> 外壳，供 evalJS 与模式检测使用。
 * 对齐 Legado splitSourceRule 提取 group(1|2) 及登录脚本 substring 语义。
 */
export function unwrapLegadoJsSnippet(ruleStr: string): string {
  let t = ruleStr.trim();
  if (!t) return t;
  if (/^@js:/i.test(t)) return t.replace(/^@js:/i, '').trim();
  const wrapped = /^<js>([\s\S]*)<\/js>$/i.exec(t);
  if (wrapped) return (wrapped[1] ?? '').trim();
  const open = t.search(/<js>/i);
  if (open >= 0) {
    const close = t.search(/<\/js>/i);
    if (close > open) return t.slice(open + 4, close).trim();
  }
  return t;
}

/**
 * 整段为 Legado JS / WebJs 脚本时，不应在 analyzeString 外层按 && / || 切分。
 * Legado getString 先 splitSourceRule，脚本内的 || 属于 JavaScript 而非规则 fallback。
 */
export function isAtomicLegadoScriptRule(ruleStr: string): boolean {
  const t = ruleStr.trim();
  if (!t) return false;
  if (/^<js>[\s\S]*<\/js>$/i.test(t)) return true;
  if (/^@js:/i.test(t)) return true;
  if (/^@webjs:/i.test(t)) return true;
  const segs = splitSourceRule(t);
  if (segs.length === 1) {
    const mode = segs[0]?.mode;
    return mode === 'js' || mode === 'webjs';
  }
  return false;
}

/** 含 @js:/<js>/@webjs: 片段时，外层不得按 &&/|| 切分（脚本内 || 属于 JavaScript）。 */
export function hasEmbeddedLegadoScript(ruleStr: string): boolean {
  if (!ruleStr?.trim()) return false;
  return splitSourceRule(ruleStr).some((s) => s.mode === 'js' || s.mode === 'webjs');
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

/** @js: 脚本体结束位置：不在字符串/括号内时，遇到 Legado 规则链 `&& :` / `&& @` 等则截断 */
function findLegadoAtJsBodyEnd(shielded: string, bodyStart: number): number {
  let i = bodyStart;
  let depth = 0;
  let inStr: "'" | '"' | '`' | null = null;
  let escape = false;

  while (i < shielded.length) {
    if (inStr) {
      if (escape) {
        escape = false;
        i += 1;
        continue;
      }
      if (shielded[i] === '\\') {
        escape = true;
        i += 1;
        continue;
      }
      if (shielded[i] === inStr) inStr = null;
      i += 1;
      continue;
    }

    if (depth === 0 && /^\s*&&\s*(?::|@@|@|\/\/|\{\{|<js>|@js:)/i.test(shielded.slice(i))) {
      return i;
    }

    const ch = shielded[i]!;
    if (ch === "'" || ch === '"' || ch === '`') {
      inStr = ch;
      i += 1;
      continue;
    }
    if (ch === '[' || ch === '(' || ch === '{') {
      depth += 1;
      i += 1;
      continue;
    }
    if ((ch === ']' || ch === ')' || ch === '}') && depth > 0) {
      depth -= 1;
      i += 1;
      continue;
    }
    i += 1;
  }
  return shielded.length;
}

function scanAtJsRule(
  shielded: string,
  from: number,
): { index: number; body: string; length: number } | null {
  const idx = shielded.indexOf('@js:', from);
  if (idx < 0) return null;
  const bodyStart = idx + 4;
  const bodyEnd = findLegadoAtJsBodyEnd(shielded, bodyStart);
  const body = shielded.slice(bodyStart, bodyEnd).trim();
  return { index: idx, body, length: bodyEnd - idx };
}

function scanWebJsRule(
  shielded: string,
  from: number,
): { index: number; body: string; length: number } | null {
  const idx = shielded.indexOf('@webjs:', from);
  if (idx < 0) return null;
  const bodyStart = idx + 7;
  const bodyEnd = findLegadoAtJsBodyEnd(shielded, bodyStart);
  const body = shielded.slice(bodyStart, bodyEnd).trim();
  if (body.length < 5) return null;
  return { index: idx, body, length: bodyEnd - idx };
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

/** splitSourceRule 主规则与 ## 替换尾（@all 等提取器后缀须留在主规则内） */
function splitMainAndReplaceShielded(shielded: string): {
  mainRule: string;
  replaceTail: string;
} {
  let mainRule = stripReplacementTail(shielded);
  const mainOffset = shielded.indexOf(mainRule);
  let suffix =
    mainOffset >= 0 ? shielded.slice(mainOffset + mainRule.length) : '';
  if (suffix.trim() && !suffix.trimStart().startsWith('##')) {
    mainRule += suffix;
    suffix = '';
  }
  const replaceTail = suffix.trimStart().startsWith('##') ? suffix : '';
  return { mainRule, replaceTail };
}

/**
 * 分解规则（对齐 Legado splitSourceRule）
 * @param allInOne 列表规则以 `:` 开头时整段走 Regex（getElement/getElements）
 */
export function splitSourceRule(ruleStr: string, allInOne = false): LegadoSourceRuleSegment[] {
  if (!ruleStr?.trim()) return [];

  const shielded = shieldInlineReplacementJs(ruleStr);
  const { mainRule: mainShielded, replaceTail: replaceShielded } =
    splitMainAndReplaceShielded(shielded);
  const ruleList: LegadoSourceRuleSegment[] = [];
  let mode: RuleMode = 'default';
  let start = 0;

  if (allInOne && mainShielded.startsWith(':')) {
    mode = 'regex';
    start = 1;
  }

  const addDefault = (text: string) => {
    const tmp = unshieldInlineReplacementJs(text).trim();
    if (!tmp) return;
    if (tmp.startsWith('##') && ruleList.length > 0) {
      const prev = ruleList[ruleList.length - 1]!;
      if (prev.mode === 'js') {
        prev.mode = 'default';
        prev.ruleStr =
          prev.jsWrap === 'atjs'
            ? `@js:${prev.ruleStr}${tmp}`
            : `<js>${prev.ruleStr}</js>${tmp}`;
        delete prev.jsWrap;
        return;
      }
      if (prev.mode === 'webjs') {
        prev.mode = 'default';
        prev.ruleStr = `@webjs:${prev.ruleStr}${tmp}`;
        return;
      }
      prev.ruleStr += tmp;
      return;
    }
    ruleList.push({ mode, ruleStr: tmp });
  };

  while (start < mainShielded.length) {
    const atJs = scanAtJsRule(mainShielded, start);
    const webJs = scanWebJsRule(mainShielded, start);
    JS_PATTERN.lastIndex = start;
    const wrapped = JS_PATTERN.exec(mainShielded);
    const wrappedIdx = wrapped?.index ?? Number.POSITIVE_INFINITY;
    const atJsIdx = atJs?.index ?? Number.POSITIVE_INFINITY;
    const webJsIdx = webJs?.index ?? Number.POSITIVE_INFINITY;
    const nextIdx = Math.min(wrappedIdx, atJsIdx, webJsIdx);

    if (nextIdx === Number.POSITIVE_INFINITY) {
      addDefault(mainShielded.slice(start));
      break;
    }

    if (nextIdx > start) {
      addDefault(mainShielded.slice(start, nextIdx));
    }

    if (wrapped && wrapped.index === nextIdx) {
      const body = (wrapped[1] ?? '').trim();
      if (body) ruleList.push({ mode: 'js', ruleStr: body, jsWrap: 'wrapped' });
      start = wrapped.index + wrapped[0].length;
      continue;
    }

    if (atJs && atJs.index === nextIdx) {
      if (atJs.body) ruleList.push({ mode: 'js', ruleStr: atJs.body, jsWrap: 'atjs' });
      start = atJs.index + atJs.length;
      continue;
    }

    if (webJs && webJs.index === nextIdx) {
      ruleList.push({ mode: 'webjs', ruleStr: webJs.body });
      start = webJs.index + webJs.length;
      continue;
    }

    addDefault(mainShielded.slice(start));
    break;
  }

  if (replaceShielded.trim()) {
    addDefault(replaceShielded);
  }

  const plain = unshieldInlineReplacementJs(ruleStr).trim();
  if (ruleList.length === 1 && ruleList[0].mode === 'default' && isLikelyJavaScriptRule(ruleList[0].ruleStr)) {
    const solo = ruleList[0].ruleStr;
    // 含 ## 替换尾时保持 default，由 executeSourceRuleSegment + splitLegadoReplaceTail 处理
    if (stripReplacementTail(solo).trim() === solo.trim()) {
      ruleList[0] = { mode: 'js', ruleStr: unwrapLegadoJsSnippet(solo) };
    }
  } else if (ruleList.length === 0 && isLikelyJavaScriptRule(plain)) {
    ruleList.push({ mode: 'js', ruleStr: unwrapLegadoJsSnippet(plain) });
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
  const trimmed = shieldInlineReplacementJs(rule.trim());
  if (!trimmed.includes('##')) {
    return { rule: unshieldInlineReplacementJs(trimmed), replaceRegex: '', replacement: '', replaceFirst: false };
  }
  const mainRule = stripReplacementTail(trimmed);
  const tailStart = trimmed.indexOf(mainRule) + mainRule.length;
  const tailRaw = trimmed.slice(tailStart).replace(/^\s*##\s*/, '');
  if (!tailRaw) {
    return { rule: mainRule.trim(), replaceRegex: '', replacement: '', replaceFirst: false };
  }
  const sep = tailRaw.indexOf('##');
  if (sep < 0) {
    return {
      rule: unshieldInlineReplacementJs(mainRule.trim()),
      replaceRegex: unshieldInlineReplacementJs(tailRaw.trim()),
      replacement: '',
      replaceFirst: false,
    };
  }
  let replaceRegex = tailRaw.slice(0, sep).trim();
  let replacement = tailRaw.slice(sep + 2);
  let replaceFirst = false;
  if (replacement.endsWith('###')) {
    replaceFirst = true;
    replacement = replacement.slice(0, -3);
  }
  return {
    rule: unshieldInlineReplacementJs(mainRule.trim()),
    replaceRegex: unshieldInlineReplacementJs(replaceRegex),
    replacement: unshieldInlineReplacementJs(replacement),
    replaceFirst,
  };
}

const LEGADO_MODE_PREFIX_RE = /^@(css|json|xpath|js|webjs):/i;

/** 去掉 Legado 模式前缀（@css: / @json: 等）后的规则体 */
export function stripLegadoRuleModePrefix(rule: string): string {
  const trimmed = rule.trim();
  const m = trimmed.match(LEGADO_MODE_PREFIX_RE);
  return m ? trimmed.slice(m[0].length).trim() : trimmed;
}

/**
 * 列表规则是否应自动补 @all。
 * @css:.item 里的 @ 是模式前缀，不能阻止补 @all。
 */
export function legadoListRuleNeedsAllSuffix(rule: string): boolean {
  const trimmed = rule.trim();
  if (!trimmed) return false;
  if (/@all$/i.test(trimmed)) return false;
  const body = stripLegadoRuleModePrefix(trimmed);
  return !body.includes('@');
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
