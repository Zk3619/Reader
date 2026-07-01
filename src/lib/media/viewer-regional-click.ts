import type { ViewerChromeLayout } from '@/components/viewer/viewer-chrome';
import type { ReaderClickActionId, ReaderClickActions } from '@/lib/media/text/reader-click-actions';
import { resolveClickZone, type ReaderClickRegion } from '@/lib/media/text/reader-click-region';

/** 顶底栏是否可折叠（固定布局始终占位，不随显隐切换） */
export function viewerChromeBarsCollapsible(layout: ViewerChromeLayout): boolean {
  return layout !== 'fixed';
}

/**
 * 顶底栏可见且可折叠时，主区单击应仅隐藏顶底栏，不执行九宫格分区动作。
 * 顶底栏上的可交互控件由 `isMediaViewerInteractiveClick` 另行过滤。
 */
export function shouldDismissChromeOverRegionalClick(
  chromeBarsVisible: boolean,
  barsCollapsible: boolean,
): boolean {
  return barsCollapsible && chromeBarsVisible;
}

/**
 * 是否允许发起长按选文计时。
 * 可折叠布局：须先隐藏顶底栏；固定布局顶底栏无法隐藏，始终允许。
 */
export function canStartReaderTextLongPressForChrome(
  chromeBarsVisible: boolean,
  layout: ViewerChromeLayout,
): boolean {
  if (!viewerChromeBarsCollapsible(layout)) return true;
  return !chromeBarsVisible;
}

export function resolveRegionalClickAction(
  e: MouseEvent,
  container: HTMLElement | null,
  clickRegion: ReaderClickRegion,
  clickActions: ReaderClickActions,
): ReaderClickActionId | null {
  if (!container) return null;
  const rect = container.getBoundingClientRect();
  const xRatio = (e.clientX - rect.left) / Math.max(rect.width, 1);
  const yRatio = (e.clientY - rect.top) / Math.max(rect.height, 1);
  const zone = resolveClickZone(xRatio, yRatio, clickRegion);
  return clickActions[zone] ?? 'menu';
}

/** 按页阅读：优先取 `.reader-paged-viewport` 作为坐标参考 */
export function findPagedClickContainer(
  e: MouseEvent,
  scrollRoot?: HTMLElement | null,
): HTMLElement | null {
  const pagedViewport =
    scrollRoot?.querySelector<HTMLElement>('.reader-paged-viewport') ?? null;
  return (
    pagedViewport ??
    scrollRoot ??
    (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(
      '.reader-paged-viewport',
    ) ??
    (e.currentTarget as HTMLElement | null)
  );
}
