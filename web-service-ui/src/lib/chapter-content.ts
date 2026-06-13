/** 章节段落拆分与字符位置（对齐 Legado ChapterContent） */

const IMG_PATTERN = /<img[^>]*>/gi;

export function splitChapterParagraphs(raw: string): string[] {
  if (!raw?.trim()) return [];
  const byNewline = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (byNewline.length > 1) return byNewline;
  return [raw];
}

export function paragraphCharCount(paragraph: string): number {
  return paragraph.replace(IMG_PATTERN, ' ').replace(/<[^>]+>/g, '').length;
}

export function buildChapterPosOffsets(paragraphs: string[]): number[] {
  let pos = -1;
  return paragraphs.map((p) => {
    pos += paragraphCharCount(p) + 1;
    return pos;
  });
}

export function findParagraphIndexForPos(offsets: number[], pos: number): number {
  if (pos <= 0) return 0;
  const idx = offsets.findIndex((o) => o >= pos);
  return idx < 0 ? offsets.length - 1 : idx;
}
