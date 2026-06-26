/**
 * 朗读进度（对标 Legado TTS_PROGRESS）
 */

import { plainTextForAloud } from '@/lib/media/text/read-aloud';

export type ReadAloudProgress = {
  chapterIndex: number;
  paragraphIndex: number;
  paragraphCount: number;
  paragraphText: string;
  /** 0–1，章内段落比例 */
  chapterPos: number;
  /** 章内 UTF-16 字符偏移（按页字级高亮） */
  chapterCharPosition?: number;
  /** 当前段内已朗读字符偏移 */
  paragraphCharIndex?: number;
};

let current: ReadAloudProgress | null = null;
const listeners = new Set<(p: ReadAloudProgress | null) => void>();

export function computeChapterPosFromParagraph(
  paragraphIndex: number,
  paragraphCount: number,
): number {
  if (paragraphCount <= 1) return 0;
  return Math.min(1, Math.max(0, paragraphIndex / (paragraphCount - 1)));
}

/** 系统 TTS 字级边界：在段内插值 chapterPos */
export function computeChapterCharPosition(
  paragraphs: string[],
  paragraphIndex: number,
  charIndex = 0,
): number {
  let pos = 0;
  for (let i = 0; i < paragraphIndex && i < paragraphs.length; i++) {
    pos += plainTextForAloud(paragraphs[i]).length + 1;
  }
  if (paragraphIndex >= 0 && paragraphIndex < paragraphs.length) {
    const plain = plainTextForAloud(paragraphs[paragraphIndex]);
    pos += Math.min(charIndex, plain.length);
  }
  return Math.max(0, pos);
}

/** 当前段在章内的字符区间 [start, end) */
export function paragraphCharRangeFromProgress(
  progress: ReadAloudProgress,
): { start: number; end: number; readEnd: number } | null {
  if (progress.chapterCharPosition == null) return null;
  const readEnd = progress.paragraphCharIndex ?? 0;
  const paraPlainLen = plainTextForAloud(progress.paragraphText).length;
  const start = progress.chapterCharPosition - readEnd;
  return { start, end: start + paraPlainLen, readEnd: start + readEnd };
}

/** 系统 TTS 字级边界：在段内插值 chapterPos */
export function computeFineChapterPos(
  paragraphIndex: number,
  paragraphCount: number,
  charIndex: number,
  paragraphText: string,
): number {
  const base = computeChapterPosFromParagraph(paragraphIndex, paragraphCount);
  if (paragraphCount <= 1 || paragraphIndex >= paragraphCount - 1) return base;
  const next = computeChapterPosFromParagraph(paragraphIndex + 1, paragraphCount);
  const len = Math.max(1, paragraphText.length);
  const t = Math.min(1, Math.max(0, charIndex / len));
  return base + (next - base) * t;
}

export function emitReadAloudProgress(progress: ReadAloudProgress | null): void {
  current = progress;
  for (const fn of listeners) fn(progress);
}

export function getReadAloudProgress(): ReadAloudProgress | null {
  return current;
}

export function subscribeReadAloudProgress(
  listener: (p: ReadAloudProgress | null) => void,
): () => void {
  listeners.add(listener);
  listener(current);
  return () => listeners.delete(listener);
}

export function clearReadAloudProgress(): void {
  emitReadAloudProgress(null);
}
