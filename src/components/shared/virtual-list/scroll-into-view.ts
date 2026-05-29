/** 固定行高虚拟列表：将索引滚入视口 */
export function virtualListScrollToIndex(
  container: HTMLDivElement,
  index: number,
  rowHeight: number,
  behavior: ScrollBehavior = 'auto',
): void {
  const top = Math.max(0, index * rowHeight - container.clientHeight / 2 + rowHeight / 2);
  container.scrollTo({ top, behavior });
}
