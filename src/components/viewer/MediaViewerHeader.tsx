import { Show, splitProps, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';
import { useMediaViewerShellOptional } from '@/components/viewer/media-viewer-shell-context';
import { MediaViewerFloatingTopChrome } from '@/components/viewer/MediaViewerFloatingTopChrome';
import { useViewerChromeLayout } from '@/lib/viewer/viewer-chrome-layout';
import {
  mediaViewerChromeTopSurfaceClass,
  type ViewerChromeLayout,
} from '@/components/viewer/viewer-chrome';
import { mediaViewerChromeBarHoverHandlers } from '@/lib/media/media-viewer-chrome-bar-hover';

export interface MediaViewerHeaderProps {
  children: JSX.Element;
  /** 主工具栏下方的附加行（如文本阅读器章节/书源栏） */
  subHeader?: JSX.Element;
  /** 顶栏最下方附加行（如跟随顶栏的页眉） */
  bottomSlot?: JSX.Element;
  /** 覆盖应用设置中的布局（一般无需指定） */
  layout?: ViewerChromeLayout;
  visible?: boolean;
  class?: string;
}

export function MediaViewerHeader(props: MediaViewerHeaderProps) {
  const [local] = splitProps(props, ['children', 'subHeader', 'bottomSlot', 'layout', 'visible', 'class']);
  const shell = useMediaViewerShellOptional();
  const chromeLayout = useViewerChromeLayout();
  const layout = () => local.layout ?? chromeLayout();
  const visible = () => {
    if (layout() === 'fixed') return true;
    if (local.visible !== undefined) return local.visible;
    if (shell) return shell.headerVisible();
    return true;
  };

  const chromeBarHover = () => mediaViewerChromeBarHoverHandlers(shell, layout());

  const toolbarRow = () => (
    <div
      class={cn(
        'flex w-full items-center gap-2',
        layout() === 'floating' && 'items-start justify-between',
        layout() !== 'floating' && 'h-14 px-4',
      )}
    >
      {local.children}
    </div>
  );

  const chromeBody = () => (
    <>
      {toolbarRow()}
      <Show when={local.subHeader}>{local.subHeader}</Show>
      <Show when={local.bottomSlot}>{local.bottomSlot}</Show>
    </>
  );

  return (
    <>
      <Show when={layout() === 'floating'}>
        <MediaViewerFloatingTopChrome
          visible={visible()}
          class={local.class}
          onPointerEnter={chromeBarHover().onPointerEnter}
          onPointerLeave={chromeBarHover().onPointerLeave}
        >
          <div class="pointer-events-none flex w-full min-w-0 flex-col gap-0.5">
            {chromeBody()}
          </div>
        </MediaViewerFloatingTopChrome>
      </Show>
      <Show when={layout() === 'stacked'}>
        <header
          class={cn(
            'reader-chrome-overlay-panel reader-chrome-overlay-panel--top',
            'absolute left-0 right-0 top-0 z-10',
            !visible() && 'reader-chrome-overlay-panel--hidden',
            local.class,
          )}
          data-media-viewer-interactive-zone
          data-tauri-drag-region
          onClick={(e) => e.stopPropagation()}
          onPointerEnter={chromeBarHover().onPointerEnter}
          onPointerLeave={chromeBarHover().onPointerLeave}
        >
          <div
            class={cn(
              'reader-chrome-overlay-panel__surface flex flex-col',
              mediaViewerChromeTopSurfaceClass,
            )}
          >
            {chromeBody()}
          </div>
        </header>
      </Show>
      <Show when={layout() === 'fixed'}>
        <header
          class={cn(
            'reader-top-bar flex shrink-0 flex-col border-b border-border/50 bg-background/95 backdrop-blur safe-area-inset-top',
            !visible() && 'reader-bar-hidden',
            local.class,
          )}
          data-tauri-drag-region
          onClick={(e) => e.stopPropagation()}
        >
          {chromeBody()}
        </header>
      </Show>
    </>
  );
}
