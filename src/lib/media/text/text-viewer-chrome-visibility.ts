/** 窄屏底栏操作区是否应显示（布局改由 CSS 断点控制，此函数仅供非 UI 逻辑参考） */
export function textViewerOperationBarVisible(
  viewportAtLeastPrimaryToolbar: boolean,
  headerVisible: boolean,
): boolean {
  return !viewportAtLeastPrimaryToolbar && headerVisible;
}

/** 文本底栏 overlay 是否与顶栏一起显隐（与另外三 viewer 一致，均为 headerVisible） */
export function textViewerChromeFooterOverlayVisible(headerVisible: boolean): boolean {
  return headerVisible;
}
