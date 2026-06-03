import type { TextViewerUiConfig } from '@/lib/media/text/reader-ui-config';

export type TextViewerStatusBarDisplayStyle = TextViewerUiConfig['statusBarDisplayStyle'];

/** 进度状态栏是否应显示（与顶栏联动策略由阅读配置决定） */
export function textViewerStatusBarVisible(
  style: TextViewerStatusBarDisplayStyle,
  headerVisible: boolean,
): boolean {
  if (style === 'always') return true;
  if (style === 'never') return false;
  return headerVisible;
}

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
