import { splitProps, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';
import { useMediaViewerShellOptional } from '@/components/viewer/media-viewer-shell-context';
import type { ViewerChromePlacement } from '@/components/viewer/viewer-chrome';

export interface MediaViewerHeaderProps {
  children: JSX.Element;
  /** fixed：占位顶栏（流式布局）；overlay：悬浮于主内容之�?*/
  placement?: ViewerChromePlacement;
  /** 不传�?overlay 时跟�?MediaViewerShell �?headerVisible */
  visible?: boolean;
  class?: string;
}

export function MediaViewerHeader(props: MediaViewerHeaderProps) {
  const [local] = splitProps(props, ['children', 'placement', 'visible', 'class']);
  const shell = useMediaViewerShellOptional();
  const placement = () => local.placement ?? 'overlay';
  const visible = () => {
    if (local.visible !== undefined) return local.visible;
    if (placement() === 'overlay' && shell) return shell.headerVisible();
    return true;
  };

  return (
    <header
      class={cn(
        placement() === 'overlay' &&
          'reader-top-bar absolute left-0 right-0 top-0 z-10 flex h-14 items-center gap-2 border-b border-border/50 bg-background/95 px-4 backdrop-blur safe-area-inset-top',
        placement() === 'fixed' &&
          'reader-top-bar flex h-14 shrink-0 items-center gap-2 border-b border-border/50 bg-background/95 px-4 backdrop-blur safe-area-inset-top',
        !visible() && 'reader-bar-hidden',
        local.class,
      )}
      data-tauri-drag-region
      onClick={(e) => e.stopPropagation()}
    >
      {local.children}
    </header>
  );
}
