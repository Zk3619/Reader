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

function splitXPathLegadoExtractor(rule: string): { xpath: string; extractor: string | null } {
  const lastAt = rule.lastIndexOf('@');
  if (lastAt <= 0) return { xpath: rule, extractor: null };
  const xpathPart = rule.slice(0, lastAt).trim();
  const suffix = rule.slice(lastAt + 1);
  const suffixLower = suffix.toLowerCase();
  if (!xpathPart.startsWith('//') && !xpathPart.startsWith('(')) {
    return { xpath: rule, extractor: null };
  }
  if (XPATH_EXTRACTOR_KEYWORDS.has(suffixLower) || /^[\w:-]+$/.test(suffix)) {
    return { xpath: xpathPart, extractor: `@${suffix}` };
  }
  return { xpath: rule, extractor: null };
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

function tryParseXPathWithLegadoExtractor(rule: string, html: string): string[] | null {
  const { xpath, extractor } = splitXPathLegadoExtractor(rule);
  if (!extractor) return null;
  const css = simpleXPathToCss(xpath);
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
  const selector = xpathDescendantPathToCheerioSelector(elementPath);
  if (selector) {
    const el = $(selector).first();
    if (el.length) {
      const segments = collectElementTextSegments(el);
      const text = (segments.length > 0 ? segments.join('\n') : el.text())
        .replace(/\s{2,}/g, ' ')
        .trim();
      return text ? [text] : [];
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

  return [];
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

  try {
    const normalized = preprocessXPathHtmlLikeLegado(html);
    const parser = new DOMParser();
    const doc = parser.parseFromString(normalized.content, normalized.mime);

    const results = evaluateXPath(xpath, doc, null, {
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

    const attrFallback = parseSimpleAttrXPathWithCheerio(xpath, normalized.content);
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
