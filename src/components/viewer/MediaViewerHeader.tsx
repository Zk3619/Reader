import { splitProps, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';
import { useMediaViewerShellOptional } from '@/components/viewer/media-viewer-shell-context';
import { MediaViewerFloatingTopChrome } from '@/components/viewer/MediaViewerFloatingTopChrome';
import { useViewerChromeLayout } from '@/lib/viewer/viewer-chrome-layout';
import {
  mediaViewerChromeTopSurfaceClass,
  type ViewerChromeLayout,
} from '@/components/viewer/viewer-chrome';

export interface MediaViewerHeaderProps {
  children: JSX.Element;
  /** 覆盖应用设置中的布局（一般无需指定） */
  layout?: ViewerChromeLayout;
  visible?: boolean;
  class?: string;
}

export function MediaViewerHeader(props: MediaViewerHeaderProps) {
  const [local] = splitProps(props, ['children', 'layout', 'visible', 'class']);
  const shell = useMediaViewerShellOptional();
  const chromeLayout = useViewerChromeLayout();
  const layout = () => local.layout ?? chromeLayout();
  const visible = () => {
    if (layout() === 'fixed') return true;
    if (local.visible !== undefined) return local.visible;
    if (shell) return shell.headerVisible();
    return true;
  };

  const toolbarRow = () => (
    <div
      class={cn(
        'flex h-14 items-center gap-2',
        layout() === 'floating' ? 'px-3' : 'px-4',
      )}
    >
      {local.children}
    </div>
  );

  if (layout() === 'floating') {
    return (
      <MediaViewerFloatingTopChrome visible={visible()} class={local.class}>
        {toolbarRow()}
      </MediaViewerFloatingTopChrome>
    );
  }

  if (layout() === 'stacked') {
    return (
      <header
        class={cn(
          'reader-chrome-overlay-panel reader-chrome-overlay-panel--top',
          'absolute left-0 right-0 top-0 z-10',
          !visible() && 'reader-chrome-overlay-panel--hidden',
          local.class,
        )}
        data-tauri-drag-region
        onClick={(e) => e.stopPropagation()}
      >
        <div
          class={cn(
            'reader-chrome-overlay-panel__surface',
            mediaViewerChromeTopSurfaceClass,
          )}
        >
          {toolbarRow()}
        </div>
      </header>
    );
  }

  return (
    <header
      class={cn(
        'reader-top-bar flex shrink-0 flex-col border-b border-border/50 bg-background/95 backdrop-blur safe-area-inset-top',
        !visible() && 'reader-bar-hidden',
        local.class,
      )}
      data-tauri-drag-region
      onClick={(e) => e.stopPropagation()}
    >
      {toolbarRow()}
    </header>
  );
}
