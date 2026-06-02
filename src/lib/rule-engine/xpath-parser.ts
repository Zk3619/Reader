/**
 * XPath解析器
 * 对应 legado 项目的 AnalyzeByXPath.kt（JXDocument.sel / asString）
 */

import { evaluateXPath } from 'fontoxpath';
import { DOMParser } from '@xmldom/xmldom';
import { parseCss } from '@/lib/rule-engine/css-parser';
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

/** 按 `/` 切分 XPath 路径段（不切开 `[@class="a b"]` 内括号） */
function splitXPathPathSegments(path: string): string[] {
  const segments: string[] = [];
  let current = '';
  let depth = 0;
  for (const ch of path) {
    if (ch === '[') depth += 1;
    else if (ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === '/' && depth === 0) {
      if (current.trim()) segments.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) segments.push(current.trim());
  return segments;
}

function xpathSegmentToCheerioSelector(segment: string): string | null {
  const m = segment.match(/^([a-zA-Z*][\w-]*)(?:\[@(class|id)=['"]([^'"]+)['"]\])?$/);
  if (!m) return null;
  return resolveXPathElementSelector(m[1] || '*', m[2], m[3]);
}

/**
 * 将 Legado 常见 XPath 列表路径转为 Cheerio 选择器。
 * - `//div[@class="a"]/div` → `div.a > div`
 * - `//div[@class="a"]//div` → `div.a div`（沿用 descendant 转换）
 */
function xpathPathToCheerioSelector(xpath: string): string | null {
  const trimmed = xpath.trim();
  if (!trimmed.startsWith('//')) return null;
  const rest = trimmed.slice(2);
  if (!rest) return null;
  if (rest.includes('//')) {
    return xpathDescendantPathToCheerioSelector(trimmed);
  }
  const segments = splitXPathPathSegments(rest);
  if (segments.length === 0) return null;
  const cssParts: string[] = [];
  for (const seg of segments) {
    const css = xpathSegmentToCheerioSelector(seg);
    if (!css) return null;
    cssParts.push(css);
  }
  if (cssParts.length === 1) return cssParts[0]!;
  return cssParts.join(' > ');
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
  const trimmed = elementPath.trim().replace(/^\/+/, '');
  if (!trimmed) return null;
  const segments = trimmed.split('//').map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return null;

  const chunks: string[] = [];
  for (const seg of segments) {
    const m = seg.match(/^([a-zA-Z*][\w-]*)(?:\[@(class|id)=['"]([^'"]+)['"]\])?$/);
    if (!m) return null;
    const tag = m[1] || '*';
    const attr = m[2];
    const value = m[3];
    if (attr === 'id' && value) {
      chunks.push(`${tag}#${value}`);
      continue;
    }
    if (attr === 'class' && value) {
      const classes = value
        .split(/\s+/)
        .map((x) => x.trim())
        .filter(Boolean);
      chunks.push(`${tag}${classes.map((c) => `.${c}`).join('')}`);
      continue;
    }
    chunks.push(tag);
  }
  return chunks.join(' ');
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

  const { xpath: xpathQuery, extractor } = splitXPathLegadoExtractor(xpath);
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
