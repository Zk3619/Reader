/**
 * TXT 目录规则引擎（对齐 Legado TextFile.kt）
 */

import { wrapLegadoJsBodyWithImplicitReturn } from '@/lib/js-engine/quickjs-sandbox';
import type { Book, TxtTocRule } from '@/types';

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

/** 旧版将 bookUrl 误写入 tocUrl 时视为无缓存规则 */
export function isLegacyTocUrlAsBookPath(tocUrl: string | undefined, bookUrl: string): boolean {
  const raw = tocUrl?.trim();
  if (!raw || isStoredTxtTocRule(raw)) return false;
  if (raw === bookUrl.trim()) return true;
  return (
    raw.startsWith('content://') ||
    raw.startsWith('file://') ||
    /^[a-zA-Z]:[\\/]/.test(raw) ||
    raw.includes('\\') ||
    (raw.includes('/') && !raw.includes(TXT_TOC_RULE_SEP))
  );
}

export function toTxtTocJsBook(book: Pick<Book, 'name' | 'author' | 'bookUrl' | 'originName' | 'intro'>): Record<string, unknown> {
  return {
    name: book.name,
    author: book.author,
    bookUrl: book.bookUrl,
    originName: book.originName,
    intro: book.intro,
  };
}

export interface TxtTocReplacementContext {
  index: number;
  prevTitle: string | null;
  prevLength: number;
  lastVolumeTitle: string;
  /** JS java.putVolume 插入的卷标题（按调用顺序） */
  volumeTitles: string[];
}

export interface TxtTocReplacementResult {
  title: string;
  lastVolumeTitle: string;
  volumeTitles: string[];
}

/**
 * 执行 Legado 风格 replacement 脚本
 * 绑定：result, index, prevTitle, prevLength, lastVolumeTitle, book, java.putVolume
 */
/** Legado replacement：多语句脚本以 result 为默认返回值 */
function wrapTxtTocReplacementJs(js: string): string {
  const trimmed = js.trim();
  if (!trimmed) return 'return result;';
  if (/\breturn\b/.test(trimmed)) return trimmed;
  if (trimmed.includes(';')) return `${trimmed}\nreturn result;`;
  return wrapLegadoJsBodyWithImplicitReturn(trimmed);
}

export function evalTxtTocReplacement(
  rawTitle: string,
  replacement: string | undefined,
  ctx: TxtTocReplacementContext,
  book?: Record<string, unknown>,
): TxtTocReplacementResult {
  const js = replacement?.trim();
  const volumeTitles: string[] = [...ctx.volumeTitles];
  let lastVolumeTitle = ctx.lastVolumeTitle;

  if (!js) {
    return { title: rawTitle, lastVolumeTitle, volumeTitles };
  }

  try {
    const body = wrapTxtTocReplacementJs(js);
    const fn = new Function(
      'result',
      'index',
      'prevTitle',
      'prevLength',
      'lastVolumeTitle',
      'book',
      'java',
      body,
    ) as (
      result: string,
      index: number,
      prevTitle: string | null,
      prevLength: number,
      lastVolumeTitle: string,
      book: Record<string, unknown>,
      java: { putVolume: (title: string) => void },
    ) => unknown;

    const java = {
      putVolume: (title: string) => {
        const t = String(title ?? '').trim();
        if (!t) return;
        lastVolumeTitle = t;
        volumeTitles.push(t);
      },
    };

    const out = fn(
      rawTitle,
      ctx.index,
      ctx.prevTitle,
      ctx.prevLength,
      lastVolumeTitle,
      book ?? {},
      java,
    );

    const title = out == null ? '' : String(out);
    return { title, lastVolumeTitle, volumeTitles };
  } catch (e) {
    console.warn('[TXT目录] 标题净化脚本失败:', e);
    return { title: rawTitle, lastVolumeTitle, volumeTitles };
  }
}

async function applyTitleReplacement(
  title: string,
  replacement: string | undefined,
  index: number,
  prevTitle: string | null,
  prevLength: number,
  lastVolumeTitle: string,
  volumeTitles: string[],
  book?: Record<string, unknown>,
): Promise<TxtTocReplacementResult> {
  return evalTxtTocReplacement(title, replacement, {
    index,
    prevTitle,
    prevLength,
    lastVolumeTitle,
    volumeTitles,
  }, book);
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
    let lastVolumeTitle = '';
    const volumeTitles: string[] = [];
    let match: RegExpExecArray | null;
    regex.lastIndex = 0;

    while ((match = regex.exec(content)) !== null) {
      const contentLength = match.index - start;
      if (start === 0 || contentLength > 1000) {
        const replaced = await applyTitleReplacement(
          match[0].trim(),
          tocRule.replacement,
          csNum + 1,
          lastTitle,
          contentLength,
          lastVolumeTitle,
          volumeTitles,
        );
        if (replaced.title) {
          lastTitle = replaced.title;
          lastVolumeTitle = replaced.lastVolumeTitle;
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
  /** 匹配前的正文片段（用于判断卷名） */
  precedingContent: string;
  /** 由 java.putVolume 插入的卷节点 */
  isVolume?: boolean;
}

/**
 * 按单条规则扫描章节边界（对齐 Legado analyze 正则循环）
 */
export async function scanTxtTocMatches(
  content: string,
  rule: string,
  replacement = '',
  book?: Record<string, unknown>,
): Promise<TxtTocChapterMatch[]> {
  if (!rule.trim()) return [];
  const regex = new RegExp(rule, 'gm');
  const matches: TxtTocChapterMatch[] = [];
  let match: RegExpExecArray | null;
  let prevTitle: string | null = null;
  let prevMatchEnd = 0;
  let lastVolumeTitle = '';
  const accumulatedVolumes: string[] = [];

  regex.lastIndex = 0;
  while ((match = regex.exec(content)) !== null) {
    const rawTitle = match[0].trim();
    if (!rawTitle || rawTitle.length > 120) continue;

    const precedingContent = content.substring(prevMatchEnd, match.index);
    const prevLength = matches.length === 0 ? -1 : match.index - prevMatchEnd;

    const replaced = await applyTitleReplacement(
      rawTitle,
      replacement,
      matches.length + 1,
      prevTitle,
      prevLength,
      lastVolumeTitle,
      accumulatedVolumes,
      book,
    );

    if (!replaced.title) continue;

    lastVolumeTitle = replaced.lastVolumeTitle;

    // putVolume 在本匹配前插入卷节点
    const newVolumes = replaced.volumeTitles.slice(accumulatedVolumes.length);
    for (const volTitle of newVolumes) {
      matches.push({
        index: prevMatchEnd,
        title: volTitle,
        precedingContent: '',
        isVolume: true,
      });
    }
    accumulatedVolumes.push(...newVolumes);

    matches.push({
      index: match.index,
      title: replaced.title,
      precedingContent,
    });
    prevTitle = replaced.title;
    prevMatchEnd = match.index + match[0].length;
  }

  return matches;
}

/**
 * 预览规则在前 N 字符样本中的有效章节数（用于规则选择对话框）
 */
export async function countTxtTocRuleMatches(
  sample: string,
  rule: TxtTocRule,
): Promise<number> {
  if (!rule.rule.trim()) return 0;
  const matches = await scanTxtTocMatches(sample, rule.rule, rule.replacement);
  return matches.filter((m) => !m.isVolume).length;
}

/**
 * 根据 tocUrl 存储串匹配当前选中的规则名称
 */
export function matchTxtTocRuleByStorage(
  tocUrl: string | undefined | null,
  rules: TxtTocRule[],
): TxtTocRule | null {
  const stored = parseTocRuleStorage(tocUrl);
  if (!stored) return null;
  if (!stored.rule.trim()) {
    return rules.find((r) => !r.rule.trim()) ?? null;
  }
  return (
    rules.find(
      (r) => r.rule === stored.rule && (r.replacement ?? '') === (stored.replacement ?? ''),
    ) ?? null
  );
}
