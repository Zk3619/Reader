/**
 * 正文拉取路径追踪（缓存 vs ruleContent / 直连 /content）
 * DEV 或 localStorage「reader_content_trace=1」时输出详细日志
 */

import { scanImgTags } from '@/lib/media/text/scan-img-tags';

export function isContentFetchTraceEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return localStorage.getItem('reader_content_trace') === '1';
  } catch {
    return false;
  }
}

interface RawContentSummary {
  contentLen: number;
  imgCount: number;
}

function summarizeRawContent(content: string): RawContentSummary {
  const trimmed = content.trim();
  const imgCount = trimmed.includes('<img') ? scanImgTags(trimmed).length : 0;
  return {
    contentLen: trimmed.length,
    imgCount,
  };
}

/** 始终输出：章节缓存命中（未走 ruleContent） */
export function warnChapterCacheHit(
  chapterIndex: number,
  content: string,
  chapterTitle?: string,
): void {
  const summary = summarizeRawContent(content);
  console.warn('[content] 章节缓存命中，未执行 ruleContent /content', {
    chapterIndex,
    title: chapterTitle,
    ...summary,
    hint:
      summary.imgCount > 0 && summary.imgCount <= 12
        ? '图片偏少可能是旧缓存；请点阅读器右上角「刷新本章」后查看 [rule-script] / [content] 日志'
        : '若正文异常，请点「刷新本章」强制重新拉取',
  });
}

/** 强制刷新：清除缓存后重新拉取 */
export function logChapterForceRefresh(chapterIndex: number, chapterTitle?: string): void {
  console.warn('[content] 强制刷新本章，将重新执行 ruleContent', {
    chapterIndex,
    title: chapterTitle,
  });
}

/** 网络拉取开始 */
export function traceContentFetchStart(
  stage: string,
  extra?: Record<string, unknown>,
): void {
  if (!isContentFetchTraceEnabled()) return;
  console.log(`[content] ${stage}`, extra ?? {});
}

/** ruleContent / /content 完成摘要 */
export function traceContentFetchDone(
  stage: string,
  content: string,
  extra?: Record<string, unknown>,
): void {
  if (!isContentFetchTraceEnabled()) return;
  console.log(`[content] ${stage}`, {
    ...summarizeRawContent(content),
    ...extra,
  });
}

/** 始终输出：正文拉取结果或失败原因（生产环境可见） */
export function warnContentFetchOutcome(
  stage: string,
  extra?: Record<string, unknown>,
): void {
  console.warn(`[content] ${stage}`, extra ?? {});
}
