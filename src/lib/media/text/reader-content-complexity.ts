/** 判断章节是否必须用 DOM 测量分页（含图、复杂 HTML、段评 SVG 等） */

const DOM_LAYOUT_HTML_RE =
  /<(img|figure|svg|video|audio|iframe|table|canvas|picture|object|embed|math|fieldset|form|input|button|select|textarea|hr)\b/i;

/** 非 <p>/<br> 的块级/结构标签 → 必须 DOM */
const DOM_LAYOUT_STRUCTURAL_RE =
  /<(blockquote|pre|code|ul|ol|li|dl|dt|dd|h[1-6]|div|section|article|aside|header|footer|style|script|table)\b/i;

const LEGADO_COMMENT_IMG_RE = /showCmt|legado:\/\/comment/i;

export function needsDomChapterLayout(raw: string): boolean {
  const text = raw?.trim() ?? '';
  if (!text) return false;
  if (DOM_LAYOUT_HTML_RE.test(text)) return true;
  if (LEGADO_COMMENT_IMG_RE.test(text)) return true;
  if (DOM_LAYOUT_STRUCTURAL_RE.test(text)) return true;
  const imgCount = (text.match(/<img\b/gi) ?? []).length;
  if (imgCount > 0) return true;
  return false;
}

export function canUseCanvasChapterLayout(raw: string): boolean {
  return !needsDomChapterLayout(raw);
}
