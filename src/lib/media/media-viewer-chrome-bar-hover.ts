import type { MediaViewerShellContextValue } from '@/components/viewer/media-viewer-shell-context';
import type { ViewerChromeLayout } from '@/components/viewer/viewer-chrome';

/** 层叠/悬浮顶底栏：鼠标悬停时暂停自动隐藏，移出后重新计时 */
export function mediaViewerChromeBarHoverHandlers(
  shell: MediaViewerShellContextValue | undefined,
  layout: ViewerChromeLayout,
): {
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
} {
  if (!shell || layout === 'fixed' || !shell.chromeBarsCollapsible()) {
    return {};
  }
  return {
    onPointerEnter: shell.onChromeBarPointerEnter,
    onPointerLeave: shell.onChromeBarPointerLeave,
  };
}
