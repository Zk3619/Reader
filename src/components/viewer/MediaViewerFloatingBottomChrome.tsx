import { splitProps, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';

export interface MediaViewerFloatingBottomChromeProps {
  children: JSX.Element;
  visible?: boolean;
  class?: string;
}

/** 悬浮底栏：控件独立浮于内容区底部 */
export function MediaViewerFloatingBottomChrome(props: MediaViewerFloatingBottomChromeProps) {
  const [local] = splitProps(props, ['children', 'visible', 'class']);
  const visible = () => local.visible !== false;

  return (
    <div
      class={cn(
        'reader-chrome-floating-bottom pointer-events-none absolute inset-x-0 bottom-0 z-10',
        'app-bottom-chrome-inset',
        !visible() && 'reader-chrome-floating-bottom--hidden',
        local.class,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div class="reader-chrome-floating-bottom__track pointer-events-auto flex w-full flex-col gap-2 px-3 pb-3 pt-2">
        {local.children}
      </div>
    </div>
  );
}
