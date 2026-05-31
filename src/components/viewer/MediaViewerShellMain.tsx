import { splitProps, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';
import { useMediaViewerShell } from '@/components/viewer/media-viewer-shell-context';

export interface MediaViewerShellMainProps {
  children: JSX.Element;
  class?: string;
  /** �?false 时主区点击不切换顶底栏（文本阅读器使用分区点击） */
  tapToToggleBars?: boolean;
  onClick?: (e: MouseEvent) => void;
}

/**
 * 主内容区容器：flex-1 + relative�?
 * 沉浸模式：正�?absolute inset-0，顶/底栏�?overlay 叠在内部（与 Explore �?flex-1 正文区对应）�?
 */
export function MediaViewerShellMain(props: MediaViewerShellMainProps) {
  const [local] = splitProps(props, ['children', 'class', 'tapToToggleBars', 'onClick']);
  const shell = useMediaViewerShell();

  const handleClick = (e: MouseEvent) => {
    if (local.onClick) {
      local.onClick(e);
      return;
    }
    if (local.tapToToggleBars === false) return;
    if (!shell.tapToToggleBars) return;
    shell.toggleBars();
  };

  return (
    <div
      class={cn(
        'relative flex min-h-0 flex-1 flex-col overflow-hidden',
        local.class,
      )}
      onClick={handleClick}
    >
      {local.children}
    </div>
  );
}
