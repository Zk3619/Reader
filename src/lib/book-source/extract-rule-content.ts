/**
 * 从 ruleContent JS 返回值或 $.content 结果中提取正文
 * 对齐 Legado BookContent.analyzeContent：规则链输出即正文，框架不再二次「智能解析」
 */

import {
  extractApiContent,
  isApiErrorText,
  materializeAggregationContentBody,
} from '@/lib/book-source/extract-api-content';

/** Legado ruleContent 在 startBrowserAwait 后返回的短提示，非 API 正文 */
export const LEGADO_BROWSER_PLACEHOLDER_RE = /请.*刷新|在内嵌|内嵌页|右上角刷新|播放直链/;

export function isLegadoBrowserPlaceholderContent(text: string): boolean {
  const t = text.trim();
  if (!t || t.includes('<img')) return false;
  if (LEGADO_BROWSER_PLACEHOLDER_RE.test(t)) return true;
  return t.length <= 120 && /播放|观看|刷新/.test(t) && !/^https?:\/\//i.test(t);
}

export function formatLegadoBrowserPlaceholderForReader(text: string): string {
  const t = text.trim();
  if (!t) return '<p>请在内嵌页中观看。</p>';
  if (t.startsWith('<')) return t;
  return `<p>${t}</p>`;
}

export function extractContentFromRuleOutput(raw: string): string {
  const text = raw.trim();
  if (!text) return '';
  if (isApiErrorText(text)) return '';
  if (isLegadoBrowserPlaceholderContent(text)) {
    return formatLegadoBrowserPlaceholderForReader(text);
  }

  // 规则链 $.content 已输出 HTML
  if (text.includes('<img') || text.includes('<p') || text.includes('<div')) {
    return text;
  }

  // 聚合 API 有时把 HTML 放在 hex 字符串里（书源仍写 content = data.content）
  const materialized = materializeAggregationContentBody(text);
  if (materialized.includes('<img')) {
    return materialized;
  }

  // 规则脚本返回 {"content":"..."} 且未走 $.content 时
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (
      parsed &&
      typeof parsed === 'object' &&
      !('code' in parsed) &&
      typeof parsed.content === 'string' &&
      parsed.content.trim()
    ) {
      const inner = materializeAggregationContentBody(parsed.content.trim());
      return inner.includes('<') ? inner : parsed.content;
    }
  } catch {
    /* fall through */
  }

  // 仅当仍是 API JSON 时回退（如直连 /content 未跑规则）
  return extractApiContent(raw);
}
