import { splitProps, type JSX } from 'solid-js';
import { scrollGutterStableBoth } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';
import { mediaViewerChromeFloatingTrackClass } from '@/components/viewer/viewer-chrome';

export interface MediaViewerFloatingBottomChromeProps {
  children: JSX.Element;
  visible?: boolean;
  class?: string;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}

/** 悬浮底栏：控件独立浮于内容区底部 */
export function MediaViewerFloatingBottomChrome(props: MediaViewerFloatingBottomChromeProps) {
  const [local] = splitProps(props, [
    'children',
    'visible',
    'class',
    'onPointerEnter',
    'onPointerLeave',
  ]);
  const visible = () => local.visible !== false;

  return (
    <div
      class={cn(
        'reader-chrome-floating-bottom pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col',
        !visible() && 'reader-chrome-floating-bottom--hidden',
        local.class,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        class={cn(
          'reader-chrome-floating-bottom__track pb-3 pt-2',
          mediaViewerChromeFloatingTrackClass,
          scrollGutterStableBoth,
        )}
        onPointerEnter={local.onPointerEnter}
        onPointerLeave={local.onPointerLeave}
      >
        {local.children}
      </div>
      <div
        class="pointer-events-none shrink-0 bg-background/95 backdrop-blur safe-area-min-height-bottom"
        aria-hidden="true"
      />
    </div>
  );
}
