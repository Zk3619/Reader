/** 窄屏底栏操作区是否应显示 */
export function textViewerOperationBarVisible(
  isWideScreen: boolean,
  headerVisible: boolean,
): boolean {
  return !isWideScreen && headerVisible;
}

/** 文本底栏 overlay 是否与顶栏一起显隐（与另外三 viewer 一致，均为 headerVisible） */
export function textViewerChromeFooterOverlayVisible(headerVisible: boolean): boolean {
  return headerVisible;
}
