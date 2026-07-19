/** 对齐 lx：自动滚动锚点与预览线均在容器高度约 38% 处 */
export const LYRIC_SCROLL_ANCHOR = 0.38;

/** 计算全量歌词列表应将当前行滚到的 scrollTop */
export function computeLyricScrollTop(
  activeOffsetTop: number,
  containerClientHeight: number,
  anchor = LYRIC_SCROLL_ANCHOR,
): number {
  if (containerClientHeight <= 0) return 0;
  return Math.max(0, activeOffsetTop - containerClientHeight * anchor);
}
