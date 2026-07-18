/**
 * 仅在尚无内容时展示阻塞式加载 UI（骨架屏），避免有旧数据时闪烁。
 * 有缓存/旧列表时改用 opacity 弱化 + 工具栏刷新转圈，不替换为骨架。
 */
export function shouldShowBlockingLoading(loading: boolean, contentCount: number): boolean {
  return loading && contentCount === 0;
}
