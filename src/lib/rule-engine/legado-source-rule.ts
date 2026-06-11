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
/** RSS/书源 {{}} HTML 模板：内联脚本含 ||/&&，不得按规则运算符切分 */
export function isLegadoHtmlTemplateRule(ruleStr: string): boolean {
  const t = ruleStr.trim();
  if (!t.includes('{{')) return false;
  if (/^<!DOCTYPE\s+html/i.test(t) || /^<html[\s>]/i.test(t)) return true;
  return /<head[\s>]/i.test(t) && /<body[\s>]/i.test(t);
}

export function isLikelyJavaScriptRule(ruleStr: string): boolean {
  const t = ruleStr.trim();
  if (!t) return false;
  // RSS/书源 HTML 模板（含内联 script 与 ${}）不得当作纯 JS 规则
  if (/^<!DOCTYPE\s+html/i.test(t) || /^<html[\s>]/i.test(t)) return false;
  if (/<head[\s>]/i.test(t) && /<body[\s>]/i.test(t)) return false;
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

/** CSS/提取规则后的 ## 替换 与下一段 <js> 之间常以空行分隔 */
const RULE_SEGMENT_BOUNDARY_RE = /\n\s*\n\s*(?=<js>|@js:|@webjs:)/i;
const REPLACE_TAIL_JS_SHIELD_OPEN = '<js_shield>';
const REPLACE_TAIL_JS_SHIELD_CLOSE = '</js_shield>';

function hasLegadoJsSegmentBoundaryAfterReplace(plain: string): boolean {
  const main = stripReplacementTail(plain);
  const idx = plain.indexOf(main);
  if (idx < 0) return false;
  return RULE_SEGMENT_BOUNDARY_RE.test(plain.slice(idx + main.length));
}

/** ##regex##replacement 内的 <js> 不是独立规则段（fooTail##foo<js>"Tail"</js>##X） */
function shieldJsInsideReplaceTail(plain: string): string {
  const main = stripReplacementTail(plain);
  const idx = plain.indexOf(main);
  if (idx < 0) return plain;
  const afterMain = plain.slice(idx + main.length);
  if (!afterMain.trimStart().startsWith('##')) return plain;
  const boundaryRel = afterMain.search(RULE_SEGMENT_BOUNDARY_RE);
  const replaceEnd = boundaryRel >= 0 ? boundaryRel : afterMain.length;
  const replaceTail = afterMain.slice(0, replaceEnd);
  const rest = afterMain.slice(replaceEnd);
  const shieldedTail = replaceTail
    .replace(
      /<js>([\s\S]*?)<\/js>/gi,
      (_, body) => `${REPLACE_TAIL_JS_SHIELD_OPEN}${body}${REPLACE_TAIL_JS_SHIELD_CLOSE}`,
    )
    .replace(/@webjs:/gi, '@webjs_split_shield:')
    .replace(/@js:/gi, '@js_split_shield:');
  return plain.slice(0, idx + main.length) + shieldedTail + rest;
}

function unshieldJsInsideReplaceTail(rule: string): string {
  let out = rule;
  if (out.includes(REPLACE_TAIL_JS_SHIELD_OPEN)) {
    out = out.replace(
      new RegExp(
        `${REPLACE_TAIL_JS_SHIELD_OPEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s\\S]*?)${REPLACE_TAIL_JS_SHIELD_CLOSE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'g',
      ),
      '<js>$1</js>',
    );
  }
  return out.replace(/@js_split_shield:/gi, '@js:').replace(/@webjs_split_shield:/gi, '@webjs:');
}

function normalizeSplitRuleText(text: string): string {
  return unshieldJsInsideReplaceTail(unshieldInlineReplacementJs(text)).trim();
}

/**
 * Legado ##regex##replacement 仅作用于紧邻主规则的一段；
 * 其后 <js>/HTML 模板须继续拆段（绅士会所 ruleContent 等）。
 */
function remainderAfterLegadoReplace(plain: string): {
  headWithReplace: string;
  rest: string;
} {
  const mainRule = stripReplacementTail(plain);
  const mainIdx = plain.indexOf(mainRule);
  if (mainIdx < 0) return { headWithReplace: plain, rest: '' };
  let openPos = mainIdx + mainRule.length;
  while (openPos < plain.length && /\s/.test(plain[openPos]!)) openPos += 1;
  if (plain.slice(openPos, openPos + 2) !== '##') {
    return { headWithReplace: plain, rest: '' };
  }
  const boundaryRel = plain.slice(openPos).search(RULE_SEGMENT_BOUNDARY_RE);
  const headChunkEnd = boundaryRel >= 0 ? openPos + boundaryRel : plain.length;
  const parsed = splitLegadoReplaceTail(plain.slice(mainIdx, headChunkEnd));
  if (!parsed.replaceRegex && !parsed.replacement) {
    return { headWithReplace: plain, rest: '' };
  }
  let replaceSuffix = `##${parsed.replaceRegex}##${parsed.replacement}`;
  if (parsed.replaceFirst) replaceSuffix += '###';
  let replaceEnd = openPos + replaceSuffix.length;
  if (plain.slice(openPos, replaceEnd) !== replaceSuffix) {
    const bounded = plain.slice(openPos, headChunkEnd).replace(/\s+$/, '');
    replaceEnd = openPos + bounded.length;
  }
  return {
    headWithReplace: plain.slice(mainIdx, replaceEnd),
    rest: plain.slice(replaceEnd),
  };
}

/**
 * 分解规则（对齐 Legado splitSourceRule）
 * @param allInOne 列表规则以 `:` 开头时整段走 Regex（getElement/getElements）
 */
function splitSourceRuleInner(
  shielded: string,
  allInOne: boolean,
  plainForSoloJs: string,
): LegadoSourceRuleSegment[] {
  const ruleList: LegadoSourceRuleSegment[] = [];
  let mode: RuleMode = 'default';
  let start = 0;

  if (allInOne && shielded.startsWith(':')) {
    mode = 'regex';
    start = 1;
  }

  const addDefault = (text: string) => {
    const tmp = normalizeSplitRuleText(text);
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

  while (start < shielded.length) {
    const atJs = scanAtJsRule(shielded, start);
    const webJs = scanWebJsRule(shielded, start);
    JS_PATTERN.lastIndex = start;
    const wrapped = JS_PATTERN.exec(shielded);
    const wrappedIdx = wrapped?.index ?? Number.POSITIVE_INFINITY;
    const atJsIdx = atJs?.index ?? Number.POSITIVE_INFINITY;
    const webJsIdx = webJs?.index ?? Number.POSITIVE_INFINITY;
    const nextIdx = Math.min(wrappedIdx, atJsIdx, webJsIdx);

    if (nextIdx === Number.POSITIVE_INFINITY) {
      addDefault(shielded.slice(start));
      break;
    }

    if (nextIdx > start) {
      addDefault(shielded.slice(start, nextIdx));
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

    addDefault(shielded.slice(start));
    break;
  }

  const plain = plainForSoloJs.trim();
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

export function splitSourceRule(ruleStr: string, allInOne = false): LegadoSourceRuleSegment[] {
  if (!ruleStr?.trim()) return [];
  const plain = shieldJsInsideReplaceTail(ruleStr.trim());
  const shielded = shieldInlineReplacementJs(plain);
  // 仅当 ## 替换后有空行接 <js> 时再拆段（绅士会所 ruleContent）；其余保持整段 split
  if (hasLegadoJsSegmentBoundaryAfterReplace(plain)) {
    const { headWithReplace, rest } = remainderAfterLegadoReplace(plain);
    const headSegments = splitSourceRuleInner(
      shieldInlineReplacementJs(headWithReplace),
      allInOne,
      headWithReplace,
    );
    const restTrim = rest.trim();
    if (!restTrim) return headSegments;
    const restSegments = splitSourceRuleInner(
      shieldInlineReplacementJs(restTrim),
      allInOne,
      restTrim,
    );
    return [...headSegments, ...restSegments];
  }
  return splitSourceRuleInner(shielded, allInOne, plain);
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
  // 仅剥离开头 ##；勿在 ## 后再吞 \s，否则 ##\n##$ 会把换行从 replaceRegex 吃掉
  const tailRaw = trimmed.slice(tailStart).replace(/^\s*##/, '');
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
  // 勿 trim：##\n##$ 等模式的 replaceRegex 可能仅为换行等空白
  let replaceRegex = tailRaw.slice(0, sep);
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
  const mode = detectSourceRuleMode(trimmed);
  if (mode === 'js' || mode === 'webjs') return false;
  const body = stripLegadoRuleModePrefix(trimmed);
  const lowerBody = body.toLowerCase();
  if (body.startsWith('//') || lowerBody.startsWith('@xpath:')) {
    const xpathBody = lowerBody.startsWith('@xpath:') ? body.slice(7).trim() : body;
    const hasTrailingExtractor = /@(all|html|text|textnodes|owntext)$/i.test(xpathBody);
    return !hasTrailingExtractor;
  }
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
