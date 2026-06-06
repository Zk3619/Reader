/**
 * Legado 风格排版实体：TextColumn → TextLine → TextPage
 * 坐标系：章节文档 Y 向下，X 相对 reader-body 左缘
 */

/** 单字/图片列（对齐 Legado TextColumn） */
export interface ReaderTextColumn {
  startX: number;
  endX: number;
  char: string;
  /** 章节内 UTF-16 字符偏移 */
  chapterPosition: number;
}

/** 单行（对齐 Legado TextLine） */
export interface ReaderTextLine {
  lineTop: number;
  lineBase: number;
  lineBottom: number;
  text: string;
  chapterPosition: number;
  column: 0 | 1;
  isParagraphEnd?: boolean;
  columns?: ReaderTextColumn[];
}

export interface ReaderTextPageMeta {
  /** 左栏行数（双栏时右栏从 leftLineSize 起） */
  leftLineSize?: number;
  /** 本页首字在章内偏移 */
  chapterPosition: number;
  /** 本页纯文本 */
  text?: string;
  lines?: ReaderTextLine[];
}

/** 由 lines 拼接并取首行 chapterPosition */
export function metaFromTextLines(lines: ReaderTextLine[]): ReaderTextPageMeta {
  if (lines.length === 0) {
    return { chapterPosition: 0, text: '', lines: [], leftLineSize: 0 };
  }
  const leftLineSize = lines.findIndex((l) => l.column === 1);
  return {
    chapterPosition: lines[0]!.chapterPosition,
    text: lines.map((l) => l.text).join(''),
    lines,
    leftLineSize: leftLineSize >= 0 ? leftLineSize : lines.length,
  };
}

/** 双栏阅读顺序：先左栏自上而下，再右栏 */
export function sortLinesReadingOrder(lines: ReaderTextLine[]): ReaderTextLine[] {
  return [...lines].sort((a, b) => {
    if (a.column !== b.column) return a.column - b.column;
    return a.lineTop - b.lineTop;
  });
}
