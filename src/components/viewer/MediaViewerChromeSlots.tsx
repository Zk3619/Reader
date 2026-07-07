import { Show, splitProps, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';
import { useViewerChromeLayout } from '@/lib/viewer/viewer-chrome-layout';

export interface MediaViewerChromeSlotsProps {
  header: JSX.Element;
  footer: JSX.Element;
  children: JSX.Element;
  /** 铺满 chrome-slots 的侧向浮层（如左右亮度胶囊），与顶底栏同一坐标系 */
  sideOverlay?: JSX.Element;
  class?: string;
}

/**
 * 按布局排列顶栏 / 正文 / 底栏：
 * - fixed：顶栏 → 正文（flex-1 流式滚动）→ 底栏
 * - stacked / floating：正文铺满，顶底栏叠在正文上
 */
export function MediaViewerChromeSlots(props: MediaViewerChromeSlotsProps) {
  const [local] = splitProps(props, [
    'header',
    'footer',
    'children',
    'sideOverlay',
    'class',
  ]);
  const layout = useViewerChromeLayout();

  const sideOverlayLayer = () =>
    local.sideOverlay ? (
      <div class="reader-brightness-overlay-host">
        {local.sideOverlay}
      </div>
    ) : null;

  return (
    <Show
      when={layout() === 'fixed'}
      fallback={
        <div
          class={cn(
            'relative flex min-h-0 flex-1 flex-col overflow-hidden',
            local.class,
          )}
          data-media-viewer-chrome-slots
        >
          {local.children}
          {local.header}
          {local.footer}
          {sideOverlayLayer()}
        </div>
      }
    >
      <div
        class={cn(
          'relative flex min-h-0 flex-1 flex-col overflow-hidden',
          local.class,
        )}
        data-media-viewer-chrome-slots
      >
        {local.header}
        <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {local.children}
        </div>
        {local.footer}
        {sideOverlayLayer()}
      </div>
    </Show>
  );
}
