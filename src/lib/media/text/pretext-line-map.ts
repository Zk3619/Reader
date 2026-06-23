/**
 * Pretext 行级 chapterPosition 映射（UTF-16，对齐 Legado）
 */

export interface PretextLineMeta {
  lineTop: number;
  lineBottom: number;
  chapterPosition: number;
  textSlice: string;
  blockIndex: number;
}

export function pageLineMetasForRange(
  lineMetas: PretextLineMeta[],
  startY: number,
  endY: number,
): PretextLineMeta[] {
  return lineMetas.filter(
    (line) => line.lineTop >= startY - 0.5 && line.lineTop < endY - 0.5,
  );
}

export function pageTextFromLineMetas(lines: PretextLineMeta[]): string {
  return lines.map((line) => line.textSlice).join('');
}

export function pageChapterPositionFromLineMetas(lines: PretextLineMeta[]): number {
  return lines[0]?.chapterPosition ?? 0;
}
