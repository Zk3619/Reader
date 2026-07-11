/**
 * 仅在尚无内容时展示阻塞式「加载中」，避免有旧数据时闪烁。
 */
export function shouldShowBlockingLoading(loading: boolean, contentCount: number): boolean {
  return loading && contentCount === 0;
}
