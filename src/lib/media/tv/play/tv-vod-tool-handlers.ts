/**
 * 点播播放工具动作桥：顶栏「更多」、弹幕设置面板等非 Solid 节点可调用。
 * 由 TvVodPlayControls 注册（含对话框 / Web 增强态）。
 */

export type TvVodToolHandlers = {
  switchSource: () => void;
  openExternal: () => void;
  openEnhanced: () => void;
  /** 打开匹配弹幕对话框 */
  openRematch: () => void;
  enhanceLabel: '增强' | 'Web增强';
  /** 非番剧且可换源等 */
  showPlayTools: boolean;
  showRematch: boolean;
};

let handlers: TvVodToolHandlers | null = null;

export function setTvVodToolHandlers(next: TvVodToolHandlers | null): void {
  handlers = next;
}

export function getTvVodToolHandlers(): TvVodToolHandlers | null {
  return handlers;
}
