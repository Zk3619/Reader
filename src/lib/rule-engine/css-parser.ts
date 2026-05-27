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

/**
 * 解析CSS选择器规则
 */
export function parseCss(rule: string, html: string): string[] {
  if (!rule || !html) {
    return [];
  }

  try {
    const $ = cheerio.load(html, {
      xml: false,
    });

    const normalizedRule = normalizeCssRule(rule);
    if (!normalizedRule) return [];

    // 处理 Legado 链式语法：A@B@C@text
    const { rootSelector, nestedSelectors, extractor } = parseSelectorChain(normalizedRule);
    let elements = selectWithLegacyIndex($, null, rootSelector || '*');
    for (const nested of nestedSelectors) {
      elements = selectWithLegacyIndex($, elements, nested);
    }
    if (elements.length === 0) {
      return [];
    }

    const results: string[] = [];

    elements.each((_, element) => {
      const $el = $(element);
      const value = extractValue($el, extractor, $);
      if (value !== null && value !== undefined) {
        results.push(String(value).trim());
      }
    });

    return results.filter(r => r.length > 0);
  } catch (error) {
    console.error('CSS解析错误:', error, '规则:', rule);
    return [];
  }
}

function normalizeCssRule(rule: string): string {
  const trimmed = rule.trim();
  if (!trimmed) return '';
  // 兼容逗号分隔时的空片段，如 "," / "a,,b"
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
  items.each((_, el) => out.push(el));
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
): cheerio.Cheerio<T> {
  if (rawIndex == null) return items;
  const all = toArray(items);
  if (all.length === 0) return items;
  const start = normalizeIndex(all.length, parseInt(rawIndex, 10));
  if (Number.isNaN(start)) return items;
  const boundedStart = Math.max(0, Math.min(all.length - 1, start));
  if (rawEnd == null || rawEnd === '') {
    return $(all[boundedStart] as any) as cheerio.Cheerio<T>;
  }
  const end = normalizeIndex(all.length, parseInt(rawEnd, 10));
  if (Number.isNaN(end)) {
    return $(all.slice(boundedStart) as any) as cheerio.Cheerio<T>;
  }
  const boundedEnd = Math.max(0, Math.min(all.length - 1, end));
  const from = Math.min(boundedStart, boundedEnd);
  const to = Math.max(boundedStart, boundedEnd);
  return $(all.slice(from, to + 1) as any) as cheerio.Cheerio<T>;
}

function parseSelectorWithLegacyIndex(selector: string): {
  selector: string;
  index?: string;
  end?: string;
} {
  const s = normalizeLegacySelector(selector);
  const m = s.match(/^(.*)\.(-?\d+)(?::(-?\d+))?$/);
  if (!m) return { selector: s };
  const base = m[1].trim();
  // base 为空时（如 ".c_row"）是正常 class 选择器，不应当识别为索引语法
  if (!base) return { selector: s };
  // 纯数字尾索引语法，仅作为 legado 索引处理
  return { selector: base, index: m[2], end: m[3] };
}

function selectWithLegacyIndex<T>(
  $: cheerio.CheerioAPI,
  scope: cheerio.Cheerio<T> | null,
  selectorWithIndex: string,
): cheerio.Cheerio<any> {
  const { selector, index, end } = parseSelectorWithLegacyIndex(selectorWithIndex);
  const selected = scope ? scope.find(selector) : $(selector);
  return applyLegacyIndex($, selected, index, end);
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

  const rootSelector = parts[0] || '*';
  const tail = parts.slice(1);
  if (tail.length === 0) {
    return { rootSelector, nestedSelectors: [], extractor: '@text' };
  }

  const extractorKeywords = new Set(['text', 'textnodes', 'owntext', 'html', 'all']);
  const last = tail[tail.length - 1];
  const lowerLast = last.toLowerCase();

  // 末段是内置提取器，直接作为 extractor
  if (extractorKeywords.has(lowerLast)) {
    return {
      rootSelector,
      nestedSelectors: tail.slice(0, -1),
      extractor: `@${last}`,
    };
  }

  // 末段看起来是 CSS 选择器（如 .c_row / #id / [attr] / a:nth-child(1)）
  const looksLikeSelector =
    /^[.#\[:>*]/.test(last) ||
    /\s/.test(last) ||
    /[:\[\]()>]/.test(last);

  if (looksLikeSelector) {
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
  if (!extractor || extractor === '@text') {
    // 提取所有文本（包括子元素）
    return $el.text();
  }

  if (extractor === '@textNodes') {
    // 提取文本节点（换行分隔）
    const textNodes: string[] = [];
    $el.contents().each((_, node) => {
      if (node.type === 'text') {
        const text = $(node).text().trim();
        if (text) {
          textNodes.push(text);
        }
      }
    });
    return textNodes.join('\n');
  }

  if (extractor === '@ownText') {
    // 提取直接文本（不含子元素）
    return $el.clone().children().remove().end().text();
  }

  if (extractor === '@html') {
    // 提取内部HTML
    return $el.html() || null;
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
  return $el.text();
}
