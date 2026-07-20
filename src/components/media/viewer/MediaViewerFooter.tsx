import { Show, splitProps, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';
import { MediaViewerOverlayBottomChrome } from '@/components/media/viewer/MediaViewerOverlayBottomChrome';
import { MediaViewerFloatingBottomChrome } from '@/components/media/viewer/MediaViewerFloatingBottomChrome';
import { useMediaViewerShellOptional } from '@/components/media/viewer/media-viewer-shell-context';
import { useViewerChromeLayout } from '@/lib/viewer/viewer-chrome-layout';
import type { ViewerChromeLayout } from '@/components/media/viewer/viewer-chrome';
import { mediaViewerChromeBarHoverHandlers } from '@/lib/media/media-viewer-chrome-bar-hover';
import { ThemedComponentBackground } from '@/components/theme/ThemedComponentBackground';
import { componentDataAttr } from '@/lib/theme/preview/component-registry';

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
  const themedSurface = () => local.surfaceStyle != null;

  return (
    <div
      class={cn(
        'relative flex flex-col',
        layout() === 'stacked' &&
        'pointer-events-none absolute inset-x-0 bottom-0 z-10 min-h-0 max-w-full min-w-0 overflow-hidden',
        layout() === 'floating' &&
        'pointer-events-none absolute inset-x-0 bottom-0 z-10 min-h-0 max-w-full min-w-0 overflow-hidden',
        layout() === 'fixed' &&
        'reader-footer shrink-0 flex flex-col',
        local.class,
      )}
      {...componentDataAttr('footerChrome')}
      data-media-viewer-interactive-zone
      onClick={(e) => e.stopPropagation()}
    >
      <ThemedComponentBackground componentId="footerChrome" />
      <div class="relative z-1 flex flex-col">
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
          <div
            class={cn(
              'flex flex-col border-t app-bottom-chrome-inset',
              !themedSurface() && 'border-border bg-background text-foreground',
              themedSurface() && 'reader-chrome-follow-page border-t',
            )}
            style={local.surfaceStyle}
          >
            {local.children}
          </div>
        </Show>
      </div>
    </div>
  );
}
