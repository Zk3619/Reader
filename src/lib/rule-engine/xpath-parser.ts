/**
 * XPath解析器
 * 对应 legado 项目的 AnalyzeByXPath.kt
 * 
 * 使用 fontoxpath 解析XPath表达式
 */

import { evaluateXPath } from 'fontoxpath';
import { DOMParser } from '@xmldom/xmldom';
import { mergeRulePartsSync } from '@/lib/rule-engine/rule-analyzer';
import * as cheerio from 'cheerio';

function simpleXPathParentToCss(parentXPath: string): string | null {
  const m = parentXPath
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

function parseTextNodeIndexWithCheerio(
  parentXPath: string,
  index: number,
  html: string,
): string[] {
  const selector = simpleXPathParentToCss(parentXPath);
  if (!selector) return [];
  const $ = cheerio.load(html, { xml: false });
  const out: string[] = [];
  $(selector).each((_, el) => {
    const textNodes = $(el)
      .contents()
      .toArray()
      .filter((node) => node.type === 'text')
      .map((node) => (node.data ?? '').replace(/\s+/g, ' ').trim())
      .filter((text) => text.length > 0);
    const picked = textNodes[index - 1];
    if (picked) out.push(picked);
  });
  return out;
}

function parseTextNodeIndexXPath(
  xpath: string,
  html: string,
): string[] | null {
  const m = xpath.trim().match(/^(.*)\/text\(\)\[(\d+)\]\s*$/);
  if (!m) return null;
  const parentXPath = m[1]?.trim();
  const index = Number.parseInt(m[2] || '0', 10);
  if (!parentXPath || !Number.isFinite(index) || index <= 0) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const parentNodes = evaluateXPath(parentXPath, doc, null, {
    language: 'XPath3.1',
    returnType: 'ALL',
  });
  const asArray = Array.isArray(parentNodes) ? parentNodes : [parentNodes];
  const out: string[] = [];
  for (const node of asArray) {
    if (!node || typeof node !== 'object' || !('childNodes' in node)) continue;
    const textNodes = Array.from((node as Node).childNodes)
      .filter((child) => child.nodeType === 3)
      .map((child) => (child.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter((text) => text.length > 0);
    const picked = textNodes[index - 1];
    if (picked != null) {
      out.push(picked);
    }
  }
  if (out.length > 0) return out;
  // HTML 片段在 xmldom/fontoxpath 下可能出现节点树不完整，退化到 CSS 父节点 + 直系文本节点。
  return parseTextNodeIndexWithCheerio(parentXPath, index, html);
}

function parseXPathSingle(xpath: string, html: string, _baseUrl?: string): string[] {
  if (!xpath || !html) {
    return [];
  }

  try {
    const textNodeIndexed = parseTextNodeIndexXPath(xpath, html);
    if (textNodeIndexed) {
      return textNodeIndexed;
    }
    // 使用DOMParser解析HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 执行XPath查询
    const results = evaluateXPath(xpath, doc, null, {
      language: 'XPath3.1',
      returnType: 'ALL',
    });

    if (!results) {
      return [];
    }

    // 转换结果为字符串数组
    const stringResults: string[] = [];

    if (Array.isArray(results)) {
      for (const result of results) {
        const str = convertXPathResult(result);
        if (str) {
          stringResults.push(str);
        }
      }
    } else {
      const str = convertXPathResult(results);
      if (str) {
        stringResults.push(str);
      }
    }

    return stringResults.filter(r => r.trim().length > 0);
  } catch (error) {
    console.error('XPath解析错误:', error, '规则:', xpath);
    return [];
  }
}

/**
 * 解析XPath规则（支持 Legado && / || / %%）
 */
export function parseXPath(xpath: string, html: string, baseUrl?: string): string[] {
  if (!xpath || !html) return [];
  return mergeRulePartsSync(
    xpath,
    (part) => parseXPathSingle(part, html, baseUrl),
    (x) => x,
  );
}

/**
 * 转换XPath结果为字符串
 */
function convertXPathResult(result: unknown): string | null {
  if (result === null || result === undefined) {
    return null;
  }

  // 如果是字符串，直接返回
  if (typeof result === 'string') {
    return result;
  }

  // 如果是数字或布尔值，转换为字符串
  if (typeof result === 'number' || typeof result === 'boolean') {
    return String(result);
  }

  // 如果是DOM节点
  if (result && typeof result === 'object') {
    // 检查是否是Element节点
    if ('nodeType' in result) {
      const node = result as Node;
      
      if (node.nodeType === 1) {
        // Element节点，提取文本内容
        return getNodeText(node);
      } else if (node.nodeType === 3) {
        // Text节点
        return node.textContent || null;
      } else if (node.nodeType === 2) {
        // Attribute节点
        return (node as Attr).value || null;
      }
    }

    // 尝试提取textContent
    if ('textContent' in result) {
      return (result as { textContent: string }).textContent?.trim() || null;
    }

    // 尝试提取nodeValue
    if ('nodeValue' in result) {
      return (result as { nodeValue: string }).nodeValue?.trim() || null;
    }
  }

  // 默认转换为字符串
  return String(result);
}

/**
 * 获取节点的文本内容
 */
function getNodeText(node: Node): string {
  if (node.nodeType === 3) {
    // Text节点
    return node.textContent || '';
  }

  if (node.nodeType === 1) {
    // Element节点，递归获取所有文本
    let text = '';
    for (const child of Array.from(node.childNodes)) {
      text += getNodeText(child);
    }
    return text.trim();
  }

  return '';
}
