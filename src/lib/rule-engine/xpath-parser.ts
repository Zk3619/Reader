/**
 * XPath解析器
 * 对应 legado 项目的 AnalyzeByXPath.kt（JXDocument.sel / asString）
 */

import { evaluateXPath } from 'fontoxpath';
import { DOMParser } from '@xmldom/xmldom';
import { loadHtmlForCss, parseCss } from '@/lib/rule-engine/css-parser';
import {
  collectElementTextSegments,
  getLegadoDirectTextChildAt,
} from '@/lib/rule-engine/legado-dom-text';
import { mergeRulePartsSync } from '@/lib/rule-engine/rule-analyzer';
import * as cheerio from 'cheerio';

const XPATH_EXTRACTOR_KEYWORDS = new Set(['text', 'textnodes', 'owntext', 'html', 'all']);

const DIRECT_TEXT_CHILD_XPATH =
  /^\/\/([a-zA-Z*][\w-]*)(?:\[@(class|id)=['"]([^'"]+)['"]\])?\/text\(\)\[(\d+)\]$/;

/** 分离 XPath 与 Legado 提取器；`[@class="a"]` 内的 `@` 不算提取器。 */
export function splitXPathLegadoExtractor(rule: string): { xpath: string; extractor: string | null } {
  const trimmed = rule.trim();
  if (!trimmed.startsWith('//') && !trimmed.startsWith('(')) {
    return { xpath: rule, extractor: null };
  }
  const lower = trimmed.toLowerCase();
  for (const key of XPATH_EXTRACTOR_KEYWORDS) {
    const suffix = `@${key}`;
    if (lower.endsWith(suffix)) {
      return { xpath: trimmed.slice(0, -suffix.length).trim(), extractor: `@${key}` };
    }
  }
  const lastAt = trimmed.lastIndexOf('@');
  if (lastAt <= 0) return { xpath: trimmed, extractor: null };
  // XPath attribute axis: ".../@href" is part of XPath itself, not a Legado extractor.
  const beforeAt = trimmed.slice(0, lastAt).trimEnd();
  if (beforeAt.endsWith('/')) {
    return { xpath: trimmed, extractor: null };
  }
  const xpathPart = trimmed.slice(0, lastAt).trim();
  const suffix = trimmed.slice(lastAt + 1);
  if (XPATH_EXTRACTOR_KEYWORDS.has(suffix.toLowerCase()) || /^[\w:-]+$/.test(suffix)) {
    return { xpath: xpathPart, extractor: `@${suffix}` };
  }
  return { xpath: trimmed, extractor: null };
}

function simpleXPathToCss(xpath: string): string | null {
  const m = xpath
    .trim()
    .match(/^\/\/([a-zA-Z*][\w-]*)(?:\[@(class|id)=['"]([^'"]+)['"]\])?$/);
  if (!m) return null;
  const tag = m[1] || '*';
  const attr = m[2];
  const value = m[3];
  if (!attr) return tag;
  if (attr === 'id') return `${tag}#${value}`;
  const classes = value
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
  return `${tag}${classes.map((x) => `.${x}`).join('')}`;
}

/**
 * Legado/JsoupXpath 轴步谓词（对齐 XpathProcessor.visitPredicate）：
 * 数字 [n] 一律 **1 起始**，与同父、同 tag、且落在当前上下文集合中的同胞序号比较。
 */
type LegadoXPathSegment = {
  tag: string;
  attr?: 'class' | 'id';
  attrValue?: string;
  /** 1-based 位置谓词，如 span[1]、div[@class="a"][2] */
  position?: number;
};

export function parseLegadoXPathSegment(segment: string): LegadoXPathSegment | null {
  const m = segment.match(/^([a-zA-Z*][\w-]*)(?:\[@(class|id)=['"]([^'"]+)['"]\])?(?:\[(\d+)\])?$/);
  if (!m) return null;
  return {
    tag: m[1] || '*',
    attr: m[2] as 'class' | 'id' | undefined,
    attrValue: m[3],
    position: m[4] !== undefined ? parseInt(m[4], 10) : undefined,
  };
}

export function xpathQueryHasLegadoNumericIndex(xpath: string): boolean {
  const trimmed = xpath.trim();
  if (!trimmed.startsWith('//')) return false;
  const pairs = splitXPathSegmentsWithAxis(trimmed);
  return pairs.some((p) => parseLegadoXPathSegment(p.segment)?.position !== undefined);
}

function xpathSegmentToCssChunk(segment: string): string | null {
  const parsed = parseLegadoXPathSegment(segment);
  if (!parsed || parsed.position !== undefined) return null;
  return resolveXPathElementSelector(parsed.tag, parsed.attr, parsed.attrValue);
}

function xpathSegmentToCheerioSelector(segment: string): string | null {
  return xpathSegmentToCssChunk(segment);
}

function splitXPathSegmentsWithAxis(xpath: string): Array<{ axis: 'desc' | 'child'; segment: string }> {
  const out: Array<{ axis: 'desc' | 'child'; segment: string }> = [];
  let i = 0;
  const n = xpath.length;

  while (i < n) {
    let axis: 'desc' | 'child' = 'child';
    if (xpath.startsWith('//', i)) {
      axis = 'desc';
      i += 2;
    } else if (xpath[i] === '/') {
      axis = 'child';
      i += 1;
    }

    let depth = 0;
    let seg = '';
    while (i < n) {
      const ch = xpath[i]!;
      if (ch === '[') depth += 1;
      else if (ch === ']') depth = Math.max(0, depth - 1);
      if (depth === 0 && xpath.startsWith('//', i)) break;
      if (depth === 0 && ch === '/') break;
      seg += ch;
      i += 1;
    }
    const trimmed = seg.trim();
    if (trimmed) out.push({ axis, segment: trimmed });
  }

  return out;
}

/**
 * 将 Legado 常见 XPath 列表路径转为 Cheerio 选择器。
 * - `//div[@class="a"]/div` → `div.a > div`
 * - `//div[@class="a"]//div` → `div.a div`（沿用 descendant 转换）
 */
function elementMatchesLegadoXPathSegment(
  $: cheerio.CheerioAPI,
  el: any,
  seg: LegadoXPathSegment,
): boolean {
  if (seg.tag !== '*' && el.tagName !== seg.tag) return false;
  if (seg.attr === 'id') {
    return $(el).attr('id') === seg.attrValue;
  }
  if (seg.attr === 'class' && seg.attrValue) {
    const need = seg.attrValue.split(/\s+/).map((x) => x.trim()).filter(Boolean);
    const have = ($(el).attr('class') ?? '').split(/\s+/).map((x) => x.trim()).filter(Boolean);
    return need.length > 0 && need.every((c) => have.includes(c));
  }
  return true;
}

function pickLegadoXPathScope($: cheerio.CheerioAPI): cheerio.Cheerio<any> {
  const body = $('body');
  if (body.length > 0) return body;
  return $.root().children();
}

/** 对齐 JsoupXpath CommonUtil.getElIndexInSameTags：1-based，仅统计 context 内同 tag 同胞 */
function getSameTagIndexInXPathContext(
  el: any,
  contextSet: Set<any>,
  tag: string,
): number {
  const parent = el.parent;
  if (!parent || parent.type !== 'tag') return -1;
  let index = 1;
  for (const child of parent.children) {
    if (child.type !== 'tag') continue;
    if (tag !== '*' && child.tagName !== tag) continue;
    if (!contextSet.has(child)) continue;
    if (child === el) return index;
    index += 1;
  }
  return -1;
}

function filterByJsoupXpathNumericPredicate(
  $: cheerio.CheerioAPI,
  candidates: cheerio.Cheerio<any>,
  seg: LegadoXPathSegment,
): cheerio.Cheerio<any> {
  const want = seg.position;
  if (want === undefined) return candidates;
  const contextSet = new Set(candidates.toArray());
  const matched: any[] = [];
  candidates.each((_, el) => {
    if (getSameTagIndexInXPathContext(el, contextSet, seg.tag) === want) {
      matched.push(el);
    }
  });
  return matched.length > 0 ? $(matched) : cheerio.load('')('');
}

function selectLegadoXPathStep(
  $: cheerio.CheerioAPI,
  scope: cheerio.Cheerio<any>,
  seg: LegadoXPathSegment,
  axis: 'desc' | 'child',
): cheerio.Cheerio<any> {
  const tag = seg.tag === '*' ? '*' : seg.tag;
  let candidates =
    axis === 'desc'
      ? scope.find(tag)
      : scope.children(tag);

  if (seg.attr || seg.tag === '*') {
    candidates = candidates.filter((_, el) => elementMatchesLegadoXPathSegment($, el, seg));
  }

  return filterByJsoupXpathNumericPredicate($, candidates, seg);
}

/** 对齐 Legado AnalyzeByXPath → JsoupXpath JXDocument.selN */
export function queryLegadoXPathElements(
  html: string,
  xpath: string,
): cheerio.Cheerio<any> {
  const pairs = splitXPathSegmentsWithAxis(xpath.trim());
  if (pairs.length === 0) return cheerio.load('')('');

  const $ = loadHtmlForCss(html);
  let context = pickLegadoXPathScope($);

  for (const pair of pairs) {
    const seg = parseLegadoXPathSegment(pair.segment);
    if (!seg) return cheerio.load('')('');
    context = selectLegadoXPathStep($, context, seg, pair.axis);
    if (context.length === 0) return cheerio.load('')('');
  }

  return context;
}

function extractLegadoXPathElementStrings(
  xpathQuery: string,
  html: string,
  extractor: string,
): string[] {
  const elements = queryLegadoXPathElements(html, xpathQuery);
  if (elements.length === 0) return [];

  if (extractor === '@html') {
    const clone = elements.clone();
    clone.find('script').remove();
    clone.find('style').remove();
    const merged = clone.toString().trim();
    return merged ? [merged] : [];
  }

  const $ = loadHtmlForCss(html);
  const results: string[] = [];
  elements.each((_, el) => {
    const outer = $.html(el);
    if (outer?.trim()) results.push(outer.trim());
  });
  return results;
}

function xpathPathToCheerioSelector(xpath: string): string | null {
  const trimmed = xpath.trim();
  if (!trimmed.startsWith('//')) return null;
  if (xpathQueryHasLegadoNumericIndex(trimmed)) return null;
  const pairs = splitXPathSegmentsWithAxis(trimmed);
  if (pairs.length === 0) return null;
  let out = '';
  for (let idx = 0; idx < pairs.length; idx += 1) {
    const pair = pairs[idx]!;
    const css = xpathSegmentToCheerioSelector(pair.segment);
    if (!css) return null;
    if (idx === 0) {
      out += css;
      continue;
    }
    out += pair.axis === 'desc' ? ` ${css}` : ` > ${css}`;
  }
  return out || null;
}

function tryParseXPathWithLegadoExtractor(rule: string, html: string): string[] | null {
  const { xpath, extractor } = splitXPathLegadoExtractor(rule);
  if (!extractor) return null;
  const css = simpleXPathToCss(xpath) ?? xpathPathToCheerioSelector(xpath);
  if (!css) return null;
  return parseCss(`${css}${extractor}`, html);
}

function preprocessXPathHtmlLikeLegado(input: string): { content: string; mime: 'text/html' | 'application/xml' } {
  let html = input;
  if (html.endsWith('</td>')) {
    html = `<tr>${html}</tr>`;
  }
  if (html.endsWith('</tr>') || html.endsWith('</tbody>')) {
    html = `<table>${html}</table>`;
  }
  const trimmed = html.trimStart();
  if (trimmed.startsWith('<?xml')) {
    return { content: html, mime: 'application/xml' };
  }
  return { content: html, mime: 'text/html' };
}

function stripIllegalXmlChars(input: string): string {
  if (!input) return input;
  let out = '';
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    // 允许: \t \n \r 及 >= 0x20 的可见字符；剔除 XML 非法控制字符。
    if (code === 0x09 || code === 0x0a || code === 0x0d || code >= 0x20) {
      out += input[i]!;
    }
  }
  return out;
}

function prepareContentForXmldom(
  content: string,
  mime: 'text/html' | 'application/xml',
): { content: string; mime: 'text/html' | 'application/xml' } {
  const sanitized = stripIllegalXmlChars(content);
  if (mime === 'application/xml') {
    return { content: sanitized, mime };
  }

  const trimmed = sanitized.trimStart().toLowerCase();
  if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
    return { content: sanitized, mime };
  }
  // 兼容 Jsoup 的“片段容错”语义：将 HTML 片段包裹为完整文档再做 XPath。
  return { content: `<html><body>${sanitized}</body></html>`, mime };
}

function parseSimpleAttrXPathWithCheerio(xpath: string, html: string): string[] | null {
  const m = xpath
    .trim()
    .match(/^\/\/([a-zA-Z*][\w-]*)(?:\[@(class|id)=['"]([^'"]+)['"]\])?\/@([\w:-]+)$/);
  if (!m) return null;
  const tag = m[1] || '*';
  const attr = m[2];
  const value = m[3];
  const targetAttr = m[4];
  const $ = cheerio.load(html, { xml: false });
  let selector = tag;
  if (attr === 'id' && value) selector += `#${value}`;
  if (attr === 'class' && value) {
    const classes = value
      .split(/\s+/)
      .map((x) => x.trim())
      .filter(Boolean);
    selector += classes.map((x) => `.${x}`).join('');
  }
  const out: string[] = [];
  $(selector).each((_, el) => {
    const hit = $(el).attr(targetAttr);
    if (hit != null && hit.trim().length > 0) out.push(hit.trim());
  });
  return out;
}

function resolveXPathElementSelector(
  tag: string,
  attr: string | undefined,
  value: string | undefined,
): string {
  let selector = tag;
  if (attr === 'id' && value) selector += `#${value}`;
  if (attr === 'class' && value) {
    selector += value
      .split(/\s+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => `.${x}`)
      .join('');
  }
  return selector;
}

/**
 * Legado/JXDocument：//tag/text()[n] — 第 n 个直接子文本节点（1-based）
 * 已识别该模式时返回 string[]（可空数组），勿再 fallback fontoxpath。
 */
/** //div[@class="a b"]//div[@id="x"] → div.a.b div#x */
function xpathDescendantPathToCheerioSelector(elementPath: string): string | null {
  return xpathPathToCheerioSelector(elementPath);
}

/**
 * 含位置谓词的多段 XPath 属性提取（如 //p[@class="info"]/span[1]/a/@href）
 * 在 fontoxpath 因脏 HTML（分页 <<）失败时走 Cheerio，对齐 Jsoup 容错。
 */
function parseXPathAttrPathWithCheerio(xpath: string, html: string): string[] | null {
  const trimmed = xpath.trim();
  const m = trimmed.match(/^(\/\/.+)\/@([\w:-]+)$/);
  if (!m) return null;
  const elementPath = m[1].trim();
  const targetAttr = m[2];

  if (xpathQueryHasLegadoNumericIndex(elementPath)) {
    const elements = queryLegadoXPathElements(html, elementPath);
    if (elements.length === 0) return [];
    const $ = loadHtmlForCss(html);
    const out: string[] = [];
    elements.each((_, el) => {
      const hit = $(el).attr(targetAttr);
      if (hit != null && hit.trim().length > 0) out.push(hit.trim());
    });
    return out;
  }

  const css =
    xpathPathToCheerioSelector(elementPath) ?? xpathDescendantPathToCheerioSelector(elementPath);
  if (!css) return null;

  const $ = cheerio.load(html, { xml: false });
  const out: string[] = [];
  $(css).each((_, el) => {
    const hit = $(el).attr(targetAttr);
    if (hit != null && hit.trim().length > 0) out.push(hit.trim());
  });
  return out;
}

/**
 * Legado JXDocument：//…/text()（无 [n]）取节点全部直接文本
 */
function parseXPathTrailingAllText(xpath: string, html: string): string[] | null {
  const trimmed = xpath.trim();
  if (!trimmed.endsWith('/text()')) return null;
  if (/\/text\(\)\s*\[\s*\d+\s*\]\s*$/.test(trimmed)) return null;

  const elementPath = trimmed.slice(0, -'/text()'.length).trim();
  if (!elementPath.startsWith('//')) return null;

  if (xpathQueryHasLegadoNumericIndex(elementPath)) {
    const elements = queryLegadoXPathElements(html, elementPath);
    if (elements.length === 0) return [];
    const $ = loadHtmlForCss(html);
    const texts: string[] = [];
    elements.each((_, node) => {
      const el = $(node);
      const segments = collectElementTextSegments(el);
      const text = (segments.length > 0 ? segments.join('\n') : el.text())
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (text) texts.push(text);
    });
    return texts;
  }

  const $ = cheerio.load(html, { xml: false });
  const selector =
    xpathPathToCheerioSelector(elementPath) ?? xpathDescendantPathToCheerioSelector(elementPath);
  if (selector) {
    const els = $(selector);
    if (els.length >= 1) {
      const texts: string[] = [];
      els.each((_, node) => {
        const el = $(node);
        const segments = collectElementTextSegments(el);
        const text = (segments.length > 0 ? segments.join('\n') : el.text())
          .replace(/\s{2,}/g, ' ')
          .trim();
        if (text) texts.push(text);
      });
      return texts;
    }
  }

  const idMatch = elementPath.match(/@id=['"]([^'"]+)['"]/);
  if (idMatch?.[1]) {
    const el = $(`#${idMatch[1]}`).first();
    if (el.length) {
      const segments = collectElementTextSegments(el);
      const text = (segments.length > 0 ? segments.join('\n') : el.text())
        .replace(/\s{2,}/g, ' ')
        .trim();
      return text ? [text] : [];
    }
  }

  return null;
}

function parseXPathDirectTextChildIndex(xpath: string, html: string): string[] | null {
  const m = xpath.trim().match(DIRECT_TEXT_CHILD_XPATH);
  if (!m) return null;
  const tag = m[1] || '*';
  const attr = m[2];
  const value = m[3];
  const index = Math.max(0, parseInt(m[4] ?? '1', 10) - 1);

  const $ = cheerio.load(html, { xml: false });
  const selector = resolveXPathElementSelector(tag, attr, value);
  const el = $(selector).first();
  if (!el.length) return [];

  const hit = getLegadoDirectTextChildAt(el, index + 1);
  if (!hit?.trim()) return [];
  return [hit.trim()];
}

function parseXPathSingle(xpath: string, html: string, _baseUrl?: string): string[] {
  if (!xpath || !html) {
    return [];
  }

  const legadoHybrid = tryParseXPathWithLegadoExtractor(xpath, html);
  if (legadoHybrid) {
    return legadoHybrid;
  }

  const textChild = parseXPathDirectTextChildIndex(xpath, html);
  if (textChild !== null) {
    return textChild;
  }

  const trailingText = parseXPathTrailingAllText(xpath, html);
  if (trailingText !== null) {
    return trailingText;
  }

  const attrPath = parseXPathAttrPathWithCheerio(xpath, html);
  if (attrPath !== null) {
    return attrPath;
  }

  const { xpath: xpathQuery, extractor } = splitXPathLegadoExtractor(xpath);
  if (
    (extractor === '@all' || extractor === '@html') &&
    xpathQueryHasLegadoNumericIndex(xpathQuery)
  ) {
    return extractLegadoXPathElementStrings(xpathQuery, html, extractor);
  }
  // 兼容列表规则被自动补成 `//...//text()@all` 的场景：
  // `@all` 在这里不应再进入 fontoxpath，而应沿用 text() 文本提取。
  if (extractor === '@all') {
    const normalizedTextQuery = xpathQuery.replace(/\/\/text\(\)\s*$/i, '/text()');
    const textFromQuery = parseXPathTrailingAllText(normalizedTextQuery, html);
    if (textFromQuery !== null) {
      return textFromQuery;
    }
  }
  if (extractor === '@all' || extractor === '@html') {
    const css = simpleXPathToCss(xpathQuery) ?? xpathPathToCheerioSelector(xpathQuery);
    if (css) {
      return parseCss(`${css}${extractor}`, html);
    }
  }

  try {
    const normalized = preprocessXPathHtmlLikeLegado(html);
    const prepared = prepareContentForXmldom(normalized.content, normalized.mime);
    const parser = new DOMParser();
    const doc = parser.parseFromString(prepared.content, prepared.mime);

    const results = evaluateXPath(xpathQuery, doc, null, {
      language: 'XPath3.1',
      returnType: 'ALL',
    });

    if (!results) {
      return [];
    }

    const stringResults: string[] = [];
    const nodes = Array.isArray(results) ? results : [results];
    for (const result of nodes) {
      const str = convertXPathResult(result);
      if (str) {
        stringResults.push(str);
      }
    }

    const filtered = stringResults.filter((r) => r.trim().length > 0);
    if (filtered.length > 0) {
      return filtered;
    }

    const attrFallback = parseSimpleAttrXPathWithCheerio(xpathQuery, normalized.content);
    if (attrFallback && attrFallback.length > 0) {
      return attrFallback;
    }
    return filtered;
  } catch (error) {
    console.error('XPath解析错误:', error, '规则:', xpath);
    const cheerioAttr = parseXPathAttrPathWithCheerio(xpathQuery, html);
    if (cheerioAttr !== null && cheerioAttr.length > 0) {
      return cheerioAttr;
    }
    const cheerioText = parseXPathTrailingAllText(xpath, html);
    if (cheerioText !== null && cheerioText.length > 0) {
      return cheerioText;
    }
    return [];
  }
}

export function parseXPath(xpath: string, html: string, baseUrl?: string): string[] {
  if (!xpath || !html) return [];
  return mergeRulePartsSync(
    xpath,
    (part) => parseXPathSingle(part, html, baseUrl),
    (x) => x,
  );
}

function convertXPathResult(result: unknown): string | null {
  if (result === null || result === undefined) {
    return null;
  }

  if (typeof result === 'string') {
    return result;
  }

  if (typeof result === 'number' || typeof result === 'boolean') {
    return String(result);
  }

  if (result && typeof result === 'object' && 'nodeType' in result) {
    const node = result as Node;
    if (node.nodeType === 1) {
      return getNodeText(node);
    }
    if (node.nodeType === 3) {
      return node.textContent || null;
    }
    if (node.nodeType === 2) {
      return (node as Attr).value || null;
    }
  }

  if (result && typeof result === 'object' && 'textContent' in result) {
    return (result as { textContent: string }).textContent?.trim() || null;
  }

  if (result && typeof result === 'object' && 'nodeValue' in result) {
    return (result as { nodeValue: string }).nodeValue?.trim() || null;
  }

  return String(result);
}

function getNodeText(node: Node): string {
  if (node.nodeType === 3) {
    return node.textContent || '';
  }
  if (node.nodeType === 1) {
    let text = '';
    for (const child of Array.from(node.childNodes)) {
      text += getNodeText(child);
    }
    return text.trim();
  }
  return '';
}
