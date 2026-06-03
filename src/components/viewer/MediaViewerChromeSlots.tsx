import { Show, splitProps, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';
import { useViewerChromeLayout } from '@/lib/viewer/viewer-chrome-layout';

export interface MediaViewerChromeSlotsProps {
  header: JSX.Element;
  footer: JSX.Element;
  children: JSX.Element;
  class?: string;
}

/**
 * 按布局排列顶栏 / 正文 / 底栏：
 * - fixed：顶栏 → 正文（flex-1 流式滚动）→ 底栏
 * - stacked / floating：正文铺满，顶底栏叠在正文上
 */
export function MediaViewerChromeSlots(props: MediaViewerChromeSlotsProps) {
  const [local] = splitProps(props, ['header', 'footer', 'children', 'class']);
  const layout = useViewerChromeLayout();

  return (
    <Show
      when={layout() === 'fixed'}
      fallback={
        <div
          class={cn(
            'relative flex min-h-0 flex-1 flex-col overflow-hidden',
            local.class,
          )}
        >
          {local.children}
          {local.header}
          {local.footer}
        </div>
      }
    >
      <div class={cn('flex min-h-0 flex-1 flex-col overflow-hidden', local.class)}>
        {local.header}
        <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {local.children}
        </div>
        {local.footer}
      </div>
    </Show>
  );
}
