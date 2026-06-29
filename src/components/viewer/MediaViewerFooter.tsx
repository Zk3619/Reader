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
  /** 底栏附属内容最上方（如嵌入的亮度胶囊） */
  leadingSlot?: JSX.Element;
  layout?: ViewerChromeLayout;
  visible?: boolean;
  class?: string;
  surfaceClass?: string;
  surfaceStyle?: JSX.CSSProperties;
}

export function MediaViewerFooter(props: MediaViewerFooterProps) {
  const [local] = splitProps(props, [
    'children',
    'leadingSlot',
    'layout',
    'visible',
    'class',
    'surfaceClass',
    'surfaceStyle',
  ]);
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
          'pointer-events-none absolute inset-x-0 bottom-0 z-10 min-h-0 max-w-full min-w-0',
        layout() === 'floating' &&
          'pointer-events-none absolute inset-x-0 bottom-0 z-10 min-h-0 max-w-full min-w-0',
        layout() === 'fixed' &&
          'reader-footer shrink-0 flex flex-col app-bottom-chrome-inset',
        local.class,
      )}
      data-media-viewer-interactive-zone
      onClick={(e) => e.stopPropagation()}
    >
      <Show when={layout() === 'stacked'}>
        <MediaViewerOverlayBottomChrome
          visible={panelVisible()}
          surfaceClass={local.surfaceClass}
          surfaceStyle={local.surfaceStyle}
          headSlot={local.leadingSlot}
        >
          {local.children}
        </MediaViewerOverlayBottomChrome>
      </Show>
      <Show when={layout() === 'floating'}>
        <MediaViewerFloatingBottomChrome
          visible={panelVisible()}
          onPointerEnter={chromeBarHover().onPointerEnter}
          onPointerLeave={chromeBarHover().onPointerLeave}
        >
          <Show when={local.leadingSlot}>{local.leadingSlot}</Show>
          {local.children}
        </MediaViewerFloatingBottomChrome>
      </Show>
      <Show when={layout() === 'fixed'}>
        <Show when={local.leadingSlot}>{local.leadingSlot}</Show>
        <div class="flex flex-col border-t border-border bg-background">
          {local.children}
        </div>
      </Show>
    </div>
  );
}
