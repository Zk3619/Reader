/**
 * CSS选择器解析器
 * 对应 legado 项目的 AnalyzeByJSoup.kt
 * 
 * 使用 cheerio 解析HTML，支持：
 * - CSS选择器
 * - 属性提取（@属性名）
 * - 文本提取（@text, @textNodes, @ownText, @html, @all）
 * - 索引选择（tag.0:3, tag.-1, tag!0:2）
 */

import * as cheerio from 'cheerio';
import { joinElementTextNodes } from '@/lib/rule-engine/legado-dom-text';
import {
  isLikelyJavaScriptRule,
  stripLegadoRuleModePrefix,
} from '@/lib/rule-engine/legado-source-rule';
import { mergeRulePartsSync, RuleAnalyzer } from '@/lib/rule-engine/rule-analyzer';

/**
 * 解析CSS选择器规则（支持 Legado && / || / %%）
 */
export function parseCss(rule: string, html: string): string[] {
  if (!rule || !html) {
    return [];
  }
  if (isLikelyJavaScriptRule(rule)) {
    return [];
  }

  try {
    return mergeRulePartsSync(rule, (part) => parseCssSegment(part, html), (x) => x);
  } catch (error) {
    console.error('CSS解析错误:', error, '规则:', rule);
    return [];
  }
}

/**
 * Legado AnalyzeByJSoup.getElements：纯 CSS 列表（如 dl dd,dt），逗号作选择器而非运算符。
 * 规则可为 `selector` 或 `selector@all`。
 */
export function selectElementsOuterHtml(rule: string, html: string): string[] {
  const trimmed = stripLegadoRuleModePrefix(rule.trim());
  if (!trimmed || !html || isLikelyJavaScriptRule(trimmed)) return [];

  const allSuffix = trimmed.match(/^(.+?)@all$/i);
  const selector = (allSuffix ? allSuffix[1] : trimmed).trim();
  if (!selector || selector.includes('@')) return [];
  if (!isValidCssSelector(selector)) return [];

  try {
    const $ = loadHtmlForCss(html);
    const results: string[] = [];
    $(selector).each((_, element) => {
      results.push($(element).toString());
    });
    return results.filter((r) => r.trim().length > 0);
  } catch {
    return [];
  }
}

/** Legado ElementsSingle：td.1 / td.-2 表示第 N 个 td，不是 CSS 的 class="1" */
function isLegadoIndexedTagSelector(selector: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9]*\.-?\d+(?::(-?\d+))?(?::(-?\d+))?$/.test(selector.trim());
}

/** 可走 selectWithLegacyIndex（含 td.N / tag.N，不可交给 cheerio 当 class 选择器） */
function usesLegacyIndexSelector(selector: string): boolean {
  const s = selector.trim();
  return isValidCssSelector(s) || isLegadoIndexedTagSelector(s);
}

/**
 * Legado 非 @CSS: 规则里，@ 前可能是纯文本（如分类元数据），不能交给 cheerio 当选择器。
 */
export function isValidCssSelector(selector: string): boolean {
  const s = selector.trim();
  if (!s) return false;
  if (s.startsWith('//')) return false;
  if (isLegadoIndexedTagSelector(s)) return false;
  if (s === '*') return true;
  if (/[^\x00-\x7f]/.test(s)) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return false;
  if (s.includes(',') && !/^[.#\[:>*a-zA-Z]/.test(s)) return false;
  if (/\d{1,2}:\d{2}:\d{2}/.test(s) && !s.includes('.') && !s.includes('#') && !s.includes('[')) {
    return false;
  }
  return (
    /^[.#\[:>*a-zA-Z_][\w#.:\[\](),\s>*+~\-="'=]*$/i.test(s) ||
    /^[a-zA-Z][\w-]*([.:#\[]|$)/.test(s)
  );
}

function resolveContextElements($: cheerio.CheerioAPI): cheerio.Cheerio<any> {
  const body = $('body');
  if (body.length > 0) return body;
  const rootChildren = $.root().children();
  if (rootChildren.length > 0) return rootChildren;
  return $('*');
}

/** 列表项片段（body 下单个子节点）对齐 Legado：裸 href/title 等取该根元素属性 */
function resolveListItemContextElements($: cheerio.CheerioAPI): cheerio.Cheerio<any> {
  const body = $('body');
  if (body.length === 0) return resolveContextElements($);
  const direct = body.children();
  if (direct.length === 1) return direct;
  return body;
}

/** 含空格/引号/[] 的复合 CSS，不应在解析失败时回退到 body@text */
function looksLikeCompoundCssSelector(selector: string): boolean {
  const s = selector.trim();
  if (!s || s === '*') return false;
  if (/^(children|class|tag|id|text)(\.|$)/.test(s)) return false;
  return (
    s.startsWith('.') ||
    s.startsWith('#') ||
    s.startsWith('[') ||
    /[\s"'=]/.test(s) ||
    /^[a-zA-Z][\w-]*[\s.#\[]/.test(s)
  );
}

function selectByCssHead(
  $: cheerio.CheerioAPI,
  headSel: string,
): cheerio.Cheerio<any> {
  const head = headSel.trim();
  if (!head) return resolveContextElements($);

  // head 内 meta/link：优先全文匹配，避免未命中时回退到 body@text
  if (/^meta\b/i.test(head) || /^link\b/i.test(head)) {
    try {
      const found = $(head);
      if (found.length > 0) return found;
    } catch {
      return $('');
    }
    return $('');
  }

  if (usesLegacyIndexSelector(head)) {
    const legacy = selectWithLegacyIndex($, null, head);
    if (legacy.length > 0) return legacy;
    if (!looksLikeCompoundCssSelector(head)) return legacy;
  }

  if (looksLikeCompoundCssSelector(head) || isValidCssSelector(head)) {
    try {
      return $(head);
    } catch {
      return $('');
    }
  }

  return resolveContextElements($);
}

/** HTML5 解析会丢弃 table 外的 td/tr；列表项常为裸 tr，需包一层 table 对齐 Legado/Jsoup */
export function loadHtmlForCss(html: string): cheerio.CheerioAPI {
  const trimmed = html.trim();
  if (/^<tr\b/i.test(trimmed) && !/<table\b/i.test(trimmed)) {
    return cheerio.load(`<table><tbody>${trimmed}</tbody></table>`, { xml: false });
  }
  return cheerio.load(html, { xml: false });
}

const EXTRACTOR_KEYWORDS = new Set(['text', 'textnodes', 'owntext', 'html', 'all']);

/** Legado 末段属性提取器（非 CSS 选择器） */
const ATTR_EXTRACTOR_NAMES = new Set([
  'href',
  'src',
  'srcset',
  'alt',
  'title',
  'content',
  'value',
  'action',
  'name',
  'type',
  'data',
  'style',
  'class',
  'id',
]);

function isExtractorKeyword(segment: string): boolean {
  return EXTRACTOR_KEYWORDS.has(segment.trim().toLowerCase());
}

function isAttrExtractorName(segment: string): boolean {
  const s = segment.trim().toLowerCase();
  if (ATTR_EXTRACTOR_NAMES.has(s)) return true;
  if (s.startsWith('data-')) return true;
  return false;
}

/**
 * Legado @ 链末段：裸标签名（tr/td/a）、tag.x、td.1 等视为嵌套选择器，而非 @href 属性名。
 */
function isNestedSelectorSegment(segment: string): boolean {
  const last = segment.trim();
  if (!last || isExtractorKeyword(last) || isAttrExtractorName(last)) return false;
  if (/^[.#\[:>*]/.test(last) || /\s/.test(last) || /[:\[\]()>]/.test(last)) return true;
  if (/^(children|class|tag|id|text)(\.|$)/.test(last)) return true;
  if (/^[a-zA-Z][a-zA-Z0-9-]*([.!:-][\w.-]*)?$/.test(last)) return true;
  return false;
}

function isJsonDocumentContent(html: string): boolean {
  const t = html.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

function parseCssSegment(rule: string, html: string): string[] {
  const normalizedRule = normalizeCssRule(rule);
  if (!normalizedRule) return [];

  // JSON 正文上误走 CSS：JSONPath（$.x）交 analyzeRule；其它非选择器勿泄漏整段 JSON
  if (isJsonDocumentContent(html)) {
    const head = normalizedRule.split('@')[0]?.trim() ?? normalizedRule;
    if (!isValidCssSelector(head)) {
      // JSON 列表项上误走 CSS：JSONPath 由 analyzeRule 处理；其它规则视为未命中，勿泄漏整段 JSON 或规则字面量
      return [];
    }
  }

  const $ = loadHtmlForCss(html);

  if (normalizedRule.toLowerCase().startsWith('@css:')) {
    const body = normalizedRule.slice(5).trim();
    const allSuffix = body.match(/^(.+?)@all$/i);
    const bodyCore = (allSuffix ? allSuffix[1] : body).trim();
    const lastAt = bodyCore.lastIndexOf('@');
    if (lastAt > 0) {
      const selector = bodyCore.slice(0, lastAt).trim();
      const extractor = `@${bodyCore.slice(lastAt + 1)}`;
      const elements = $(selector);
      return extractElements($, elements, extractor);
    }
    if (bodyCore && isValidCssSelector(bodyCore)) {
      const elements = $(bodyCore);
      return extractElements($, elements, allSuffix ? '@all' : '@text');
    }
  }

  const analyzer = new RuleAnalyzer(normalizedRule, false);
  analyzer.trimRule();
  const chain = analyzer.splitRule('@');
  if (chain.length === 1) {
    const only = (chain[0] ?? '').trim();
    if (only && (isAttrExtractorName(only) || isExtractorKeyword(only))) {
      const scope = resolveListItemContextElements($);
      return extractElements($, scope, `@${only}`);
    }
  }
  if (chain.length > 1) {
    const headSel = chain[0]?.trim() ?? '';
    let elements = selectByCssHead($, headSel || '*');
    const tail = chain.slice(1);
    const last = tail[tail.length - 1] || '';
    const nestedSelectorTail = isNestedSelectorSegment(last);

    // Legado 兼容：末段形如 ".c_row" / "#id" / "tr" 应作为嵌套选择器，而不是 @tr 属性。
    const nestedCount = nestedSelectorTail ? tail.length : Math.max(0, tail.length - 1);
    for (let i = 0; i < nestedCount; i += 1) {
      elements = selectWithLegacyIndexInChain($, elements, tail[i] || '*');
    }

    const ext = nestedSelectorTail
      ? '@all'
      : isExtractorKeyword(last)
        ? `@${last}`
        : `@${last}`;
    return extractElements($, elements, ext);
  }

  const { rootSelector, nestedSelectors, extractor } = parseSelectorChain(normalizedRule);
  const root = usesLegacyIndexSelector(rootSelector) ? rootSelector : '*';
  let elements =
    root === '*' && !usesLegacyIndexSelector(rootSelector)
      ? resolveListItemContextElements($)
      : selectWithLegacyIndex($, null, root || '*');
  for (const nested of nestedSelectors) {
    elements = selectWithLegacyIndexInChain($, elements, nested);
  }
  return extractElements($, elements, extractor);
}

function extractElements(
  $: cheerio.CheerioAPI,
  elements: cheerio.Cheerio<any>,
  extractor: string,
): string[] {
  if (elements.length === 0) return [];
  if (extractor === '@html') {
    // 对齐 Legado(Jsoup) getResultLast("html"): 多节点合并为一段 outerHtml
    const clone = elements.clone();
    clone.find('script').remove();
    clone.find('style').remove();
    const mergedOuterHtml = clone.toString().trim();
    return mergedOuterHtml ? [mergedOuterHtml] : [];
  }
  const results: string[] = [];
  elements.each((_, element) => {
    const $el = $(element);
    const value = extractValue($el, extractor, $);
    if (value !== null && value !== undefined) {
      results.push(String(value).trim());
    }
  });
  return results.filter((r) => r.length > 0);
}

function normalizeCssRule(rule: string): string {
  const trimmed = stripLegadoRuleModePrefix(rule.trim());
  if (!trimmed) return '';
  const head = trimmed.split('@')[0]?.trim() ?? trimmed;
  if (!isValidCssSelector(head)) {
    return trimmed;
  }
  // 兼容逗号分隔时的空片段，如 "," / "a,,b"（仅对 CSS 选择器）
  const parts = trimmed
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.join(', ');
}

/** 兼容 Legado 写法：tag.h4 / tag.p 等 */
function normalizeLegacySelector(selector: string): string {
  const s = selector.trim();
  if (!s) return s;
  if (s.startsWith('tag.')) {
    return s.slice(4);
  }
  return s;
}

function toArray<T>(items: cheerio.Cheerio<T>): T[] {
  const out: T[] = [];
  items.each((_, el) => {
    out.push(el);
  });
  return out;
}

function normalizeIndex(length: number, idx: number): number {
  return idx >= 0 ? idx : length + idx;
}

function applyLegacyIndex<T>(
  $: cheerio.CheerioAPI,
  items: cheerio.Cheerio<T>,
  rawIndex?: string,
  rawEnd?: string,
  rawStep?: string,
  splitMode: '.' | '!' = '.',
): cheerio.Cheerio<T> {
  if (rawIndex == null) return items;
  const all = toArray(items);
  if (all.length === 0) return items;
  const start = normalizeIndex(all.length, parseInt(rawIndex, 10));
  if (Number.isNaN(start)) return items;
  const boundedStart = Math.max(0, Math.min(all.length - 1, start));
  if (rawEnd == null || rawEnd === '') {
    if (splitMode === '!') {
      return $(all.filter((_, i) => i !== boundedStart) as any) as cheerio.Cheerio<T>;
    }
    return $(all[boundedStart] as any) as cheerio.Cheerio<T>;
  }
  const end = normalizeIndex(all.length, parseInt(rawEnd, 10));
  if (Number.isNaN(end)) {
    return $(all.slice(boundedStart) as any) as cheerio.Cheerio<T>;
  }
  const boundedEnd = Math.max(0, Math.min(all.length - 1, end));
  const step = Math.max(1, Math.abs(parseInt(rawStep ?? '1', 10)) || 1);
  const selected: T[] = [];
  if (boundedStart <= boundedEnd) {
    for (let i = boundedStart; i <= boundedEnd; i += step) selected.push(all[i]);
  } else {
    for (let i = boundedStart; i >= boundedEnd; i -= step) selected.push(all[i]);
  }
  if (splitMode === '!') {
    const selectedSet = new Set(selected);
    return $(all.filter((el) => !selectedSet.has(el)) as any) as cheerio.Cheerio<T>;
  }
  return $(selected as any) as cheerio.Cheerio<T>;
}

function parseSelectorWithLegacyIndex(selector: string): {
  selector: string;
  index?: string;
  end?: string;
  step?: string;
  splitMode?: '.' | '!';
  bracketSpec?: string;
} {
  const s = normalizeLegacySelector(selector);
  const m = s.match(/^(.*?)([.!])(-?\d+)(?::(-?\d+))?(?::(-?\d+))?$/);
  if (!m) return { selector: s };
  const base = m[1].trim();
  // base 为空时（如 ".c_row"）是正常 class 选择器，不应当识别为索引语法
  if (!base) return { selector: s };
  // 纯数字尾索引语法，仅作为 legado 索引处理
  return { selector: base, splitMode: m[2] as '.' | '!', index: m[3], end: m[4], step: m[5] };
}

function parseBracketIndexSpec(selector: string): { baseSelector: string; spec: string } | null {
  const s = normalizeLegacySelector(selector);
  if (!s.endsWith(']')) return null;
  let depth = 0;
  let idx = -1;
  for (let i = s.length - 1; i >= 0; i -= 1) {
    const ch = s[i];
    if (ch === ']') depth += 1;
    if (ch === '[') {
      depth -= 1;
      if (depth === 0) {
        idx = i;
        break;
      }
    }
  }
  if (idx <= 0) return null;
  const spec = s.slice(idx + 1, -1).trim();
  if (!/^[!\d,\s:\-]+$/.test(spec) || !/\d/.test(spec)) return null;
  return { baseSelector: s.slice(0, idx).trim(), spec };
}

function parseSingleIndexSpec(spec: string): Array<{ start: number; end?: number; step?: number }> {
  return spec
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const parts = x.split(':').map((p) => p.trim());
      if (parts.length === 1) {
        return { start: parseInt(parts[0], 10) };
      }
      return {
        start: parts[0] === '' ? 0 : parseInt(parts[0], 10),
        end: parts[1] === '' ? undefined : parseInt(parts[1], 10),
        step: parts[2] === '' || parts[2] == null ? 1 : parseInt(parts[2], 10),
      };
    })
    .filter((x) => !Number.isNaN(x.start));
}

function applyBracketIndex<T>(
  $: cheerio.CheerioAPI,
  items: cheerio.Cheerio<T>,
  spec: string,
): cheerio.Cheerio<T> {
  const all = toArray(items);
  if (all.length === 0) return items;
  const exclude = spec.startsWith('!');
  const normalized = exclude ? spec.slice(1).trim() : spec;
  const ranges = parseSingleIndexSpec(normalized);
  const picked = new Set<number>();
  for (const rg of ranges) {
    const startRaw = normalizeIndex(all.length, rg.start);
    const endRaw = normalizeIndex(all.length, rg.end ?? rg.start);
    let start = Math.max(0, Math.min(all.length - 1, startRaw));
    let end = Math.max(0, Math.min(all.length - 1, endRaw));
    const step = Math.max(1, Math.abs(rg.step ?? 1));
    if (start <= end) {
      for (let i = start; i <= end; i += step) picked.add(i);
    } else {
      for (let i = start; i >= end; i -= step) picked.add(i);
    }
  }
  const out: T[] = [];
  for (let i = 0; i < all.length; i += 1) {
    const hit = picked.has(i);
    if ((exclude && !hit) || (!exclude && hit)) out.push(all[i]);
  }
  return $(out as any) as cheerio.Cheerio<T>;
}

function pickScope(
  $: cheerio.CheerioAPI,
  scope: cheerio.Cheerio<any> | null,
): cheerio.Cheerio<any> {
  if (scope && scope.length > 0) return scope;
  const body = $('body');
  if (body.length > 0) return body;
  return $.root().children();
}

/** Legado ElementsSingle：children / class.x / tag.x / id.x / text.x */
function selectByLegadoBeforeRule(
  $: cheerio.CheerioAPI,
  scope: cheerio.Cheerio<any> | null,
  beforeRule: string,
): cheerio.Cheerio<any> {
  const base = pickScope($, scope);
  const trimmed = beforeRule.trim();
  if (!trimmed) return base.children();
  const parts = trimmed.split('.');
  switch (parts[0]) {
    case 'children':
      return base.children();
    case 'class': {
      if (!parts[1]) return base.children();
      // Legado getElementsByClass：class.db cf → 同时含 .db 与 .cf（非 ".db cf" 单 class 名）
      const names = parts[1]
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (names.length === 0) return base.children();
      const sel = names.length === 1 ? `.${names[0]}` : names.map((n) => `.${n}`).join('');
      if (scope && scope.length > 0) {
        const $scope = scope as cheerio.Cheerio<any>;
        const selfMatched = $scope.filter(sel);
        const descendants = $scope.find(sel);
        return selfMatched.add(descendants);
      }
      return base.find(sel);
    }
    case 'tag':
      return parts[1] ? base.find(parts[1]) : base.children();
    case 'id':
      return parts[1] ? $(`#${parts[1]}`, base) : base.children();
    case 'text':
      return parts[1] ? base.find(`*:contains(${parts[1]})`) : base.children();
    default:
      return scope ? (scope as any).find(trimmed) : $(trimmed);
  }
}

function selectorHasLegacyIndex(selector: string): boolean {
  const bracket = parseBracketIndexSpec(selector);
  if (bracket) return true;
  const { index } = parseSelectorWithLegacyIndex(selector);
  return index != null && index !== '';
}

/** @ 链中间段：带索引（如 a.0）时按每个父节点分别取子元素，避免全局只保留第一个 */
function selectWithLegacyIndexInChain(
  $: cheerio.CheerioAPI,
  scope: cheerio.Cheerio<any>,
  selectorWithIndex: string,
): cheerio.Cheerio<any> {
  if (!scope || scope.length === 0) return $('');
  if (scope.length > 1 && selectorHasLegacyIndex(selectorWithIndex)) {
    const merged: any[] = [];
    scope.each((_, parent) => {
      const hit = selectWithLegacyIndex($, $(parent), selectorWithIndex);
      hit.each((_, el) => {
        merged.push(el);
      });
    });
    return $(merged);
  }
  return selectWithLegacyIndex($, scope, selectorWithIndex);
}

function selectWithLegacyIndex<T>(
  $: cheerio.CheerioAPI,
  scope: cheerio.Cheerio<T> | null,
  selectorWithIndex: string,
): cheerio.Cheerio<any> {
  if (!selectorWithIndex?.trim()) {
    return scope ? (scope as any) : $('');
  }
  const bracket = parseBracketIndexSpec(selectorWithIndex);
  if (bracket) {
    const selected = selectByLegadoBeforeRule($, scope, bracket.baseSelector);
    return applyBracketIndex($, selected, bracket.spec);
  }
  const { selector, index, end, step, splitMode } = parseSelectorWithLegacyIndex(selectorWithIndex);
  if (!isValidCssSelector(selector)) {
    if (looksLikeCompoundCssSelector(selector)) {
      try {
        const matched = scope ? (scope as any).find(selector) : $(selector);
        return matched.length > 0 ? matched : $('');
      } catch {
        return $('');
      }
    }
    return scope ? (scope as any) : $('');
  }
  const isLegadoBuiltin = /^(children|class|tag|id|text)(\.|$)/.test(selector);
  const selected = isLegadoBuiltin
    ? selectByLegadoBeforeRule($, scope, selector)
    : scope
      ? (() => {
          const $scope = scope as any;
          // 对齐 JSoup: Element.select("img") 在元素自身命中时也可返回自身。
          const selfMatched = $scope.filter(selector);
          const descendants = $scope.find(selector);
          return selfMatched.add(descendants);
        })()
      : $(selector);
  return applyLegacyIndex($, selected, index, end, step, splitMode);
}

/**
 * 解析选择器，分离选择器和提取器
 */
function parseSelectorChain(rule: string): {
  rootSelector: string;
  nestedSelectors: string[];
  extractor: string;
} {
  const parts = rule.split('@').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) {
    return { rootSelector: '*', nestedSelectors: [], extractor: '@text' };
  }

  let rootSelector = parts[0] || '*';
  if (!usesLegacyIndexSelector(rootSelector)) {
    rootSelector = '*';
  }
  const tail = parts.slice(1);
  if (tail.length === 0) {
    const only = parts[0] || '';
    if (isAttrExtractorName(only)) {
      return { rootSelector: '*', nestedSelectors: [], extractor: `@${only}` };
    }
    if (isExtractorKeyword(only)) {
      return { rootSelector: '*', nestedSelectors: [], extractor: `@${only}` };
    }
    return { rootSelector, nestedSelectors: [], extractor: '@text' };
  }

  const last = tail[tail.length - 1];

  // 末段是内置提取器，直接作为 extractor
  if (isExtractorKeyword(last)) {
    return {
      rootSelector,
      nestedSelectors: tail.slice(0, -1),
      extractor: `@${last}`,
    };
  }

  if (isNestedSelectorSegment(last)) {
    return {
      rootSelector,
      nestedSelectors: tail,
      extractor: '@all',
    };
  }

  // 否则按属性提取处理（如 @href/@src）
  return {
    rootSelector,
    nestedSelectors: tail.slice(0, -1),
    extractor: `@${last}`,
  };
}

/**
 * 提取元素值
 */
function extractValue(
  $el: cheerio.Cheerio<any>,
  extractor: string,
  $: cheerio.CheerioAPI
): string | null {
  const normalizeLegadoText = (text: string): string => text.replace(/\s+/g, ' ').trim();

  if (!extractor || extractor === '@text') {
    // 对齐 Legado(Jsoup): element.text() 会规整空白为单空格
    return normalizeLegadoText($el.text());
  }

  if (extractor === '@textNodes') {
    return joinElementTextNodes($el, $);
  }

  if (extractor === '@ownText') {
    // 对齐 Legado(Jsoup): ownText 同样规整空白
    return normalizeLegadoText($el.clone().children().remove().end().text());
  }

  if (extractor === '@html') {
    const clone = $el.clone();
    clone.find('script').remove();
    clone.find('style').remove();
    return clone.html() || null;
  }

  if (extractor === '@all') {
    // 提取外部HTML
    const element = $el[0];
    if (element) {
      return $el.toString();
    }
    return null;
  }

  if (extractor.startsWith('@')) {
    // 提取属性值
    const attrName = extractor.substring(1);
    return $el.attr(attrName) || null;
  }

  // 默认返回文本
  return normalizeLegadoText($el.text());
}
