import { splitProps, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';
import { useMediaViewerShellOptional } from '@/components/viewer/media-viewer-shell-context';
import type { ViewerChromePlacement } from '@/components/viewer/viewer-chrome';

export interface MediaViewerHeaderProps {
  children: JSX.Element;
  /** fixed：占位顶栏（流式布局）；overlay：悬浮于主内容之上 */
  placement?: ViewerChromePlacement;
  /** 不传且 overlay 时跟随 MediaViewerShell 的 headerVisible */
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
        'reader-top-bar flex shrink-0 flex-col border-b border-border/50 bg-background/95 backdrop-blur safe-area-inset-top',
        placement() === 'overlay' && 'absolute left-0 right-0 top-0 z-10',
        placement() === 'fixed' && 'shrink-0',
        !visible() && 'reader-bar-hidden',
        local.class,
      )}
      data-tauri-drag-region
      onClick={(e) => e.stopPropagation()}
    >
      <div class="flex h-14 items-center gap-2 px-4">{local.children}</div>
    </header>
  );
}