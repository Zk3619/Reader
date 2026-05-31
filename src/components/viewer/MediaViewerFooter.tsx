import { splitProps, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';
import { useMediaViewerShellOptional } from '@/components/viewer/media-viewer-shell-context';
import type { ViewerChromePlacement } from '@/components/viewer/viewer-chrome';

export interface MediaViewerFooterProps {
  children: JSX.Element;
  /** fixed：占位底栏；overlay：悬浮于主内容之�?*/
  placement?: ViewerChromePlacement;
  /** 不传�?overlay 时跟�?MediaViewerShell �?footerVisible */
  visible?: boolean;
  class?: string;
}

export function MediaViewerFooter(props: MediaViewerFooterProps) {
  const [local] = splitProps(props, ['children', 'placement', 'visible', 'class']);
  const shell = useMediaViewerShellOptional();
  const placement = () => local.placement ?? 'overlay';
  const visible = () => {
    if (local.visible !== undefined) return local.visible;
    if (placement() === 'overlay' && shell) return shell.footerVisible();
    return true;
  };

  return (
    <div
      class={cn(
        'reader-footer flex flex-col',
        placement() === 'overlay' && 'absolute bottom-0 left-0 right-0 z-10',
        placement() === 'fixed' && 'shrink-0 border-t border-border',
        !visible() && 'reader-bar-hidden',
        local.class,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {local.children}
    </div>
  );
}
