/**
 * Legado/Jsoup 文本分段：元素直接子级的文本节点，<br> 作为段间分隔（与 text()[n] / @textNodes 对齐）
 */

import type { Cheerio, CheerioAPI } from 'cheerio';

type DomElement = ReturnType<CheerioAPI> extends Cheerio<infer N> ? N : never;

/**
 * Legado/JXDocument `//el/text()[n]`（1-based）：
 * 1. 优先取第 n 个**直接子文本节点**（含空白节点，与 XPath 一致）
 * 2. 不足时按 `<br>` / 换行切段
 * 3. 仍不足且含 `|` 时按竖线切段（单文本节点多字段书源）
 */
export function getLegadoDirectTextChildAt(
  $el: Cheerio<DomElement>,
  indexOneBased: number,
): string | null {
  if (indexOneBased < 1) return null;

  const rawNodes: string[] = [];
  $el.contents().each((_, node) => {
    if (node.type === 'text') {
      rawNodes.push('data' in node ? String(node.data) : '');
    }
  });

  if (indexOneBased <= rawNodes.length) {
    const hit = rawNodes[indexOneBased - 1] ?? '';
    return hit.trim() || hit;
  }

  const segments = collectElementTextSegments($el);
  if (indexOneBased <= segments.length) {
    return segments[indexOneBased - 1] ?? null;
  }

  const merged = rawNodes.join('').trim();
  if (merged.includes('|')) {
    const parts = merged.split('|').map((s) => s.trim());
    if (indexOneBased <= parts.length) {
      return parts[indexOneBased - 1] ?? null;
    }
  }

  return null;
}

/** 按直接子节点收集文本段：<br> 切段；无 <br> 时按换行退化 */
export function collectElementTextSegments($el: Cheerio<DomElement>): string[] {
  const segments: string[] = [];
  let buffer = '';
  $el.contents().each((_, node) => {
    if (node.type === 'text') {
      buffer += 'data' in node ? String(node.data) : '';
      return;
    }
    if (node.type === 'tag' && String((node as { name?: string }).name ?? '').toLowerCase() === 'br') {
      const chunk = buffer.trim();
      if (chunk) segments.push(chunk);
      buffer = '';
    }
  });
  const tail = buffer.trim();
  if (tail) segments.push(tail);
  if (segments.length <= 1 && /\n/.test(tail || buffer)) {
    const merged = (segments[0] ?? tail ?? buffer).trim();
    const lines = merged
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length > 1) return lines;
  }
  return segments;
}

/** @textNodes：段之间用换行连接（Legado AnalyzeByJSoup.textNodes） */
export function joinElementTextNodes($el: Cheerio<DomElement>, $: CheerioAPI): string {
  const segments = collectElementTextSegments($el);
  if (segments.length > 0) return segments.join('\n');
  const textNodes: string[] = [];
  $el.contents().each((_, node) => {
    if (node.type === 'text') {
      const text = $(node).text().trim();
      if (text) textNodes.push(text);
    }
  });
  return textNodes.join('\n');
}
