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
        'reader-chrome-floating-top pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col',
        !visible() && 'reader-chrome-floating-top--hidden',
        local.class,
      )}
      data-tauri-drag-region
      onClick={(e) => e.stopPropagation()}
    >
      <div
        class="pointer-events-none shrink-0 bg-background/95 backdrop-blur safe-area-min-height-top"
        aria-hidden="true"
      />
      <div
        class="reader-chrome-floating-top__track pointer-events-auto flex h-14 items-center gap-2 px-3 pb-2 pt-3"
        onPointerEnter={local.onPointerEnter}
        onPointerLeave={local.onPointerLeave}
      >
        {local.children}
      </div>
    </header>
  );
}
