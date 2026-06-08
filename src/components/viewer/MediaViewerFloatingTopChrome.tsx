import { splitProps, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';

export interface MediaViewerFloatingTopChromeProps {
  children: JSX.Element;
  visible?: boolean;
  class?: string;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}

/** 悬浮顶栏：控件独立浮于内容区，胶囊/圆形半透明背景 */
export function MediaViewerFloatingTopChrome(props: MediaViewerFloatingTopChromeProps) {
  const [local] = splitProps(props, [
    'children',
    'visible',
    'class',
    'onPointerEnter',
    'onPointerLeave',
  ]);
  const visible = () => local.visible !== false;

  return (
    <header
      class={cn(
        'reader-chrome-floating-top pointer-events-none absolute inset-x-0 top-0 z-10',
        !visible() && 'reader-chrome-floating-top--hidden',
        local.class,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        class="reader-chrome-floating-top__track pointer-events-none flex w-full items-start justify-between gap-2 px-3 pb-2"
        onPointerEnter={local.onPointerEnter}
        onPointerLeave={local.onPointerLeave}
      >
        {local.children}
      </div>
    </header>
  );
}
