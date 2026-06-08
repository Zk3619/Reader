import { Show, splitProps, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';
import { MediaViewerOverlayBottomChrome } from '@/components/viewer/MediaViewerOverlayBottomChrome';
import { MediaViewerFloatingBottomChrome } from '@/components/viewer/MediaViewerFloatingBottomChrome';
import { useMediaViewerShellOptional } from '@/components/viewer/media-viewer-shell-context';
import { useViewerChromeLayout } from '@/lib/viewer/viewer-chrome-layout';
import type { ViewerChromeLayout } from '@/components/viewer/viewer-chrome';
import { mediaViewerChromeBarHoverHandlers } from '@/lib/media/media-viewer-chrome-bar-hover';

export interface MediaViewerFooterProps {
  children: JSX.Element;
  layout?: ViewerChromeLayout;
  visible?: boolean;
  class?: string;
}

export function MediaViewerFooter(props: MediaViewerFooterProps) {
  const [local] = splitProps(props, ['children', 'layout', 'visible', 'class']);
  const shell = useMediaViewerShellOptional();
  const chromeLayout = useViewerChromeLayout();
  const layout = () => local.layout ?? chromeLayout();
  const panelVisible = () => {
    if (layout() === 'fixed') return true;
    if (local.visible !== undefined) return local.visible;
    if (shell) return shell.headerVisible();
    return true;
  };

  const chromeBarHover = () => mediaViewerChromeBarHoverHandlers(shell, layout());

  return (
    <div
      class={cn(
        'flex flex-col',
        layout() === 'stacked' &&
          'pointer-events-none absolute inset-x-0 bottom-0 z-10 min-h-0',
        layout() === 'floating' &&
          'pointer-events-none absolute inset-x-0 bottom-0 z-10 min-h-0',
        layout() === 'fixed' &&
          'reader-footer shrink-0 border-t border-border bg-background/95 backdrop-blur app-bottom-chrome-inset',
        local.class,
      )}
      data-media-viewer-interactive-zone
      onClick={(e) => e.stopPropagation()}
    >
      <Show when={layout() === 'stacked'}>
        <MediaViewerOverlayBottomChrome visible={panelVisible()}>
          {local.children}
        </MediaViewerOverlayBottomChrome>
      </Show>
      <Show when={layout() === 'floating'}>
        <MediaViewerFloatingBottomChrome
          visible={panelVisible()}
          onPointerEnter={chromeBarHover().onPointerEnter}
          onPointerLeave={chromeBarHover().onPointerLeave}
        >
          {local.children}
        </MediaViewerFloatingBottomChrome>
      </Show>
      <Show when={layout() === 'fixed'}>{local.children}</Show>
    </div>
  );
}
