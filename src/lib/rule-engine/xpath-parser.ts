/**
 * XPath解析器
 * 对应 legado 项目的 AnalyzeByXPath.kt
 * 
 * 使用 fontoxpath 解析XPath表达式
 */

import { evaluateXPath } from 'fontoxpath';
import { DOMParser } from '@xmldom/xmldom';

/**
 * 解析XPath规则
 */
export function parseXPath(xpath: string, html: string, _baseUrl?: string): string[] {
  if (!xpath || !html) {
    return [];
  }

  try {
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
