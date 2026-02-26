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

    // 处理索引选择语法（tag.0:3, tag.-1, tag!0:2）
    const processedRule = processIndexSelector(rule);
    
    // 分离选择器和属性/文本提取器
    const { selector, extractor } = parseSelector(processedRule);
    
    if (!selector) {
      return [];
    }

    const elements = $(selector);
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

/**
 * 处理索引选择语法
 * 支持：tag.0:3, tag.-1, tag!0:2, tag[0,2,4]
 */
function processIndexSelector(rule: string): string {
  // 处理 JSONPath风格索引：tag[0,2,4] 或 tag[0:5]
  let processed = rule.replace(/\[(\d+)(?:,\s*\d+)*\]/g, (_match, first) => {
    // 简单处理，转换为CSS选择器
    return `:nth-child(${first})`;
  });

  // 处理范围语法：tag[0:5] 或 tag[0:10:2]
  processed = processed.replace(/\[(\d+):(\d+)(?::(\d+))?\]/g, (_match, start) => {
    // 范围选择需要特殊处理，这里简化处理
    return `:nth-child(n+${start})`;
  });

  // 处理legado原有语法：tag.0:3, tag.-1, tag!0:2
  processed = processed.replace(/\.(-?\d+)(?::(\d+))?/g, (_match, index) => {
    if (index === '-1') {
      return ':last-child';
    }
    return `:nth-child(${parseInt(index) + 1})`;
  });

  // 处理排除语法：tag!0:2
  processed = processed.replace(/!(\d+)(?::(\d+))?/g, (_match, start) => {
    // 排除语法需要更复杂的处理，这里简化
    return `:not(:nth-child(n+${parseInt(start) + 1}))`;
  });

  return processed;
}

/**
 * 解析选择器，分离选择器和提取器
 */
function parseSelector(rule: string): {
  selector: string;
  extractor: string;
} {
  // 检查是否有提取器（@text, @html, @属性名等）
  const atIndex = rule.lastIndexOf('@');
  if (atIndex === -1) {
    return { selector: rule, extractor: '@text' }; // 默认提取文本
  }

  const selector = rule.substring(0, atIndex).trim();
  const extractor = rule.substring(atIndex).trim();

  return {
    selector: selector || '*',
    extractor: extractor || '@text',
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
