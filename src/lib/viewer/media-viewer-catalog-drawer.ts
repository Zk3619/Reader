import { isMobile } from '@/lib/platform/detect';
import { cn } from '@/lib/utils';
import { hDrawerPanel } from '@/lib/ui/viewport-classes';

export type MediaViewerCatalogDrawerSide = 'left' | 'bottom';

/** 移动端底部抽屉，桌面 / Web 左侧抽屉 */
export function mediaViewerCatalogDrawerSide(): MediaViewerCatalogDrawerSide {
  return isMobile() ? 'bottom' : 'left';
}

export function mediaViewerCatalogDrawerContentClass(
  side: MediaViewerCatalogDrawerSide = mediaViewerCatalogDrawerSide(),
): string {
  if (side === 'left') {
    return 'flex h-full w-full max-w-sm flex-col';
  }
  return cn('flex flex-col', hDrawerPanel, 'max-h-[75dvh]');
}
