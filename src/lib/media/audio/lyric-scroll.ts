/** 自动跟唱时当前行 / 空态提示对齐容器垂直中心；拖拽或手动滚动浏览时不强制回锚 */
export const LYRIC_SCROLL_ANCHOR = 0.5;

/**
 * 计算全量歌词列表应将当前行滚到的 scrollTop。
 * 对齐 LX：以当前行垂直中心对准锚点（默认视口 50%），而非行顶。
 */
export function computeLyricScrollTop(
  activeOffsetTop: number,
  containerClientHeight: number,
  activeLineHeight = 0,
  anchor = LYRIC_SCROLL_ANCHOR,
): number {
  if (containerClientHeight <= 0) return 0;
  const lineMid = Math.max(0, activeLineHeight) / 2;
  return Math.max(0, activeOffsetTop + lineMid - containerClientHeight * anchor);
}
