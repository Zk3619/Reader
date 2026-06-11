/**
 * TXT 目录规则引擎（对齐 Legado TextFile.kt）
 */

import { evalJs } from '@/lib/js-engine';
import type { TxtTocRule } from '@/types';

/** Legado TextFile.spaceChars */
export const TXT_TOC_RULE_SEP = '🫅🈳🏻';

const OVER_RULE_COUNT = 2;

export interface TocRuleStorage {
  rule: string;
  replacement: string;
}

export function encodeTocRuleStorage(rule: string, replacement = ''): string {
  if (!rule.trim()) return '';
  return `${rule}${TXT_TOC_RULE_SEP}${replacement}`;
}

export function parseTocRuleStorage(tocUrl: string | undefined | null): TocRuleStorage | null {
  const raw = tocUrl?.trim();
  if (!raw) return null;
  const idx = raw.indexOf(TXT_TOC_RULE_SEP);
  if (idx === -1) return null;
  return {
    rule: raw.slice(0, idx),
    replacement: raw.slice(idx + TXT_TOC_RULE_SEP.length),
  };
}

export function isStoredTxtTocRule(tocUrl: string | undefined | null): boolean {
  return parseTocRuleStorage(tocUrl) != null;
}

async function applyTitleReplacement(
  title: string,
  replacement: string | undefined,
  index: number,
  prevTitle: string | null,
  prevLength: number,
): Promise<string> {
  const js = replacement?.trim();
  if (!js) return title;
  try {
    const wrapped = [
      `var index = ${index + 1};`,
      `var prevTitle = ${JSON.stringify(prevTitle)};`,
      `var prevLength = ${prevLength};`,
      `var lastVolumeTitle = '';`,
      js,
    ].join('\n');
    const out = await evalJs(wrapped, {
      result: title,
      baseUrl: '',
    });
    return out == null ? title : String(out);
  } catch (e) {
    console.warn('[TXT目录] 标题净化脚本失败:', e);
    return title;
  }
}

/**
 * 自动选择最佳目录规则（对齐 Legado getTocRule）
 */
export async function selectBestTxtTocRule(
  content: string,
  rules: TxtTocRule[],
): Promise<TxtTocRule | null> {
  let maxNum = -1;
  let best: TxtTocRule | null = null;

  for (const tocRule of rules) {
    if (!tocRule.enable || !tocRule.rule.trim()) continue;
    let regex: RegExp;
    try {
      regex = new RegExp(tocRule.rule, 'gm');
    } catch (e) {
      console.warn(`[TXT目录] 规则正则错误: ${tocRule.name}`, e);
      continue;
    }

    let start = 0;
    let csNum = 0;
    let numE = 0;
    let lastTitle: string | null = null;
    let match: RegExpExecArray | null;
    regex.lastIndex = 0;

    while ((match = regex.exec(content)) !== null) {
      const contentLength = match.index - start;
      if (start === 0 || contentLength > 1000) {
        const title = await applyTitleReplacement(
          match[0].trim(),
          tocRule.replacement,
          csNum,
          lastTitle,
          contentLength,
        );
        if (title) {
          lastTitle = title;
          csNum++;
        }
        start = match.index + match[0].length;
      } else if (contentLength < 100) {
        numE++;
      }
    }

    if (csNum >= numE * 3 && csNum > maxNum + OVER_RULE_COUNT) {
      maxNum = csNum;
      best = tocRule;
      if (maxNum > 70) break;
    }
  }

  return best;
}

export interface TxtTocChapterMatch {
  index: number;
  title: string;
}

/**
 * 按单条规则扫描章节边界
 */
export async function scanTxtTocMatches(
  content: string,
  rule: string,
  replacement = '',
): Promise<TxtTocChapterMatch[]> {
  if (!rule.trim()) return [];
  const regex = new RegExp(rule, 'gm');
  const matches: TxtTocChapterMatch[] = [];
  let match: RegExpExecArray | null;
  let prevTitle: string | null = null;
  let prevStart = 0;

  regex.lastIndex = 0;
  while ((match = regex.exec(content)) !== null) {
    const rawTitle = match[0].trim();
    if (!rawTitle || rawTitle.length > 120) continue;
    const prevLength = matches.length === 0 ? -1 : match.index - prevStart;
    const title = await applyTitleReplacement(
      rawTitle,
      replacement,
      matches.length,
      prevTitle,
      prevLength,
    );
    if (!title) continue;
    matches.push({ index: match.index, title });
    prevTitle = title;
    prevStart = match.index;
  }

  return matches;
}
