/**
 * 列表歌曲播放手势：桌面可要求双击，移动壳层始终单击。
 */

export function shouldAcceptListPlayGesture(
  doubleClick: boolean,
  opts: { isMobileLayout: boolean; listDoubleClickToPlay: boolean },
): boolean {
  if (opts.isMobileLayout) return !doubleClick;
  return opts.listDoubleClickToPlay === doubleClick;
}
