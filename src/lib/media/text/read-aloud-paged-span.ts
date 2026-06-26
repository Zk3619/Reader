/**
 * 按页朗读字级高亮（移植 Legado TextPage.upPageAloudSpan）
 */

import type { ReaderTextLine } from '@/lib/media/text/reader-text-layout-entities';

export type AloudHighlightLine = ReaderTextLine & { isReadAloud?: boolean };

export type AloudOverlayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function lineCharLength(line: ReaderTextLine): number {
  return line.text.length + (line.isParagraphEnd ? 1 : 0);
}

function lineChapterEnd(line: ReaderTextLine): number {
  return line.chapterPosition + lineCharLength(line);
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** 清除页内朗读高亮 */
export function clearPageAloudSpan(lines: AloudHighlightLine[]): AloudHighlightLine[] {
  let changed = false;
  const out = lines.map((line) => {
    if (!line.isReadAloud) return line;
    changed = true;
    return { ...line, isReadAloud: false };
  });
  return changed ? out : lines;
}

/**
 * 从页内字符偏移起，高亮当前段直至段末（Legado upPageAloudSpan）
 * @param aloudSpanStart 相对本页首字的偏移
 */
export function upPageAloudSpan(
  lines: AloudHighlightLine[],
  aloudSpanStart: number,
): AloudHighlightLine[] {
  if (!lines.length) return lines;
  const cleared = clearPageAloudSpan(lines);
  let lineStart = 0;
  for (let index = 0; index < cleared.length; index++) {
    const textLine = cleared[index]!;
    const lineLength = lineCharLength(textLine);
    if (aloudSpanStart >= lineStart && aloudSpanStart < lineStart + lineLength) {
      const out = [...cleared];
      for (let i = index - 1; i >= 0; i--) {
        const prev = out[i]!;
        if (prev.isParagraphEnd) break;
        out[i] = { ...prev, isReadAloud: true };
      }
      for (let i = index; i < out.length; i++) {
        const cur = out[i]!;
        out[i] = { ...cur, isReadAloud: true };
        if (cur.isParagraphEnd) break;
      }
      return out;
    }
    lineStart += lineLength;
  }
  return cleared;
}

export function chapterCharToPageSpanStart(
  pageChapterPosition: number,
  chapterCharPosition: number,
): number {
  return Math.max(0, chapterCharPosition - pageChapterPosition);
}

/**
 * 计算按页朗读覆盖层矩形：段级高亮 + 已朗读字级高亮
 */
export function computePagedAloudHighlightRects(
  lines: ReaderTextLine[],
  paragraphStartChar: number,
  paragraphEndChar: number,
  readEndChar: number,
  contentOffsetY: number,
): { paragraphRects: AloudOverlayRect[]; readRects: AloudOverlayRect[] } {
  const paragraphRects: AloudOverlayRect[] = [];
  const readRects: AloudOverlayRect[] = [];

  for (const line of lines) {
    const lineStart = line.chapterPosition;
    const lineEnd = lineChapterEnd(line);
    const height = Math.max(1, line.lineBottom - line.lineTop);
    const top = line.lineTop - contentOffsetY;

    if (rangesOverlap(lineStart, lineEnd, paragraphStartChar, paragraphEndChar)) {
      paragraphRects.push({
        left: 0,
        top,
        width: 0,
        height,
      });
    }

    if (!rangesOverlap(lineStart, lineEnd, paragraphStartChar, readEndChar)) continue;

    if (line.columns?.length) {
      for (const col of line.columns) {
        const colEnd = col.chapterPosition + col.char.length;
        if (col.chapterPosition >= readEndChar) break;
        if (colEnd <= paragraphStartChar) continue;
        if (col.chapterPosition >= paragraphEndChar) continue;
        readRects.push({
          left: col.startX,
          top,
          width: Math.max(1, col.endX - col.startX),
          height,
        });
      }
      continue;
    }

    const readStartOnLine = Math.max(lineStart, paragraphStartChar);
    const readEndOnLine = Math.min(lineEnd, readEndChar);
    if (readEndOnLine <= readStartOnLine) continue;
    readRects.push({
      left: 0,
      top,
      width: 0,
      height,
    });
  }

  return { paragraphRects, readRects };
}
