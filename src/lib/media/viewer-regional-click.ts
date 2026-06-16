import type { ReaderClickActionId, ReaderClickActions } from '@/lib/media/text/reader-click-actions';
import { resolveClickZone, type ReaderClickRegion } from '@/lib/media/text/reader-click-region';

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
