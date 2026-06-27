import { splitProps, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';
import { isMediaViewerInteractiveClick } from '@/lib/media/is-media-viewer-interactive-click';
import { useMediaViewerShell } from '@/components/viewer/media-viewer-shell-context';

export interface MediaViewerShellMainProps {
  children: JSX.Element;
  class?: string;
  /** false 时主区单击不切换顶底栏（文本阅读器配合 contentPrimaryAction） */
  tapToToggleBars?: boolean;
}

/**
 * 主内容区容器：flex-1 + relative
 * 沉浸模式：正文区 absolute inset-0，顶/底栏 overlay 叠在内部（与 Explore flex-1 正文区对应）
 */
export function MediaViewerShellMain(props: MediaViewerShellMainProps) {
  const [local] = splitProps(props, ['children', 'class', 'tapToToggleBars']);
  const shell = useMediaViewerShell();

  const canToggleBarsOnClick = () =>
    local.tapToToggleBars !== false && shell.tapToToggleBars && shell.onContentPrimaryClick;

  const primaryAction = () => {
    if (shell.contentPrimaryAction) return shell.contentPrimaryAction;
    if (canToggleBarsOnClick()) return () => shell.toggleBars();
    return undefined;
  };

  const handleClick = (e: MouseEvent) => {
    if (isMediaViewerInteractiveClick(e.target)) return;
    const action = primaryAction();
    if (!action || !shell.onContentPrimaryClick) return;
    shell.onContentPrimaryClick(e, () => action(e));
  };

  const handleDblClick = (e: MouseEvent) => {
    if (isMediaViewerInteractiveClick(e.target)) return;
    if (!shell.onContentDblClick) return;
    shell.onContentDblClick(e);
  };

  return (
    <div
      data-reader-brightness-host
      class={cn(
        'relative flex min-h-0 flex-1 flex-col overflow-hidden',
        local.class,
      )}
      onClick={handleClick}
      onDblClick={handleDblClick}
    >
      {local.children}
    </div>
  );
}
