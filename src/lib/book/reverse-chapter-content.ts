/**
 * 翻转章节正文（对齐 Legado ReadBookViewModel.reverseContent / toStringArray）
 */

/** 按 Unicode 码点反转字符串（与 Legado toStringArray + insert(0) 一致） */
export function reverseChapterContentText(content: string): string {
  return [...content].reverse().join('');
}
