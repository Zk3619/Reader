/**
 * 主壳内 Tab 页的页面工具栏：标题 + 描述 | 操作区（左右垂直居中对齐）
 * 与 PageHeader（独立全屏页）区分，不含返回键与窗口控制。
 */

import { Show, createEffect, createSignal, onCleanup, type JSX } from 'solid-js';
import { useShellLayout } from '@/components/shell/ShellLayoutProvider';
import { ThemeSwitch } from '@/components/shell/ThemeSwitch';
import { WindowControlButtons } from '@/components/shell/WindowControlButtons';
import { Separator } from '@/components/ui/separator';
import { isMobile } from '@/lib/platform/detect';
import { cn } from '@/lib/utils';
import { pageToolbarBelowScroll } from '@/lib/ui/viewport-classes';

/** 标题+描述文本块：占满可用宽度，超出后以 … 省略 */
export function PageToolbarTitleText(props: {
  title: string;
  description?: string | JSX.Element;
  class?: string;
}) {
  return (
    <div class={cn('min-w-0 max-w-full overflow-hidden text-left', props.class)}>
      <h2 class="min-w-0 truncate text-2xl font-bold leading-tight text-foreground">
        {props.title}
      </h2>
      <Show when={props.description}>
        <div class="min-w-0 truncate text-sm leading-snug text-muted-foreground">
          {props.description}
        </div>
      </Show>
    </div>
  );
}

export interface PageToolbarProps {
  title: string;
  description?: string | JSX.Element;
  /** 自定义标题区（如下拉触发器），提供时替代 title + description */
  titleSlot?: JSX.Element;
  /** 标题左侧（如返回按钮） */
  leading?: JSX.Element;
  /** 主行右侧操作区（搜索、更多等） */
  children?: JSX.Element;
  /**
   * 第二行插槽（如书架分组标签）。
   * 横滚由本组件 `below` 外包层 `.page-toolbar-below-scroll` 承担，勿在子组件再设 overflow。
   */
  below?: JSX.Element;
  /** 为 true 时 below 外包 `.page-toolbar-below-scroll` 横滚视口 */
  belowHorizontalWheel?: boolean;
  /** 覆盖壳层默认：移动端布局时顶栏安全区 */
  insetTopSafeArea?: boolean;
  class?: string;
}

export function PageToolbar(props: PageToolbarProps) {
  const shell = useShellLayout();
  const insetTopSafeArea = () => props.insetTopSafeArea ?? shell().insetTopSafeArea;
  /** 移动壳层 + 桌面/Web 环境：顶栏无 Navigation，在 PageToolbar 补主题与窗口控制 */
  const showMobileShellDesktopChrome = () => shell().useMobileShell && !isMobile();
  const [belowScrollRef, setBelowScrollRef] = createSignal<HTMLDivElement | undefined>(undefined);

  createEffect(() => {
    const el = belowScrollRef();
    if (!props.belowHorizontalWheel || !el) return;
    const handler = (e: WheelEvent) => {
      const maxLeft = el.scrollWidth - el.clientWidth;
      if (maxLeft <= 0) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      e.preventDefault();
      e.stopPropagation();
      el.scrollLeft = Math.max(0, Math.min(el.scrollLeft + delta, maxLeft));
    };
    el.addEventListener('wheel', handler, { passive: false });
    onCleanup(() => el.removeEventListener('wheel', handler));
  });

  return (
    <div
      class={cn(
        'flex w-full min-w-0 max-w-full shrink-0 flex-col space-y-3 overflow-x-hidden px-4 pt-4',
        insetTopSafeArea() && 'safe-area-inset-top',
        props.class
      )}
    >
      <div class="flex min-w-0 items-center justify-between gap-4">
        <div class="flex min-w-0 flex-1 items-center gap-3">
          <Show when={props.leading}>
            <div class="flex shrink-0 items-center">{props.leading}</div>
          </Show>
          <Show
            when={props.titleSlot}
            fallback={
              <PageToolbarTitleText title={props.title} description={props.description} />
            }
          >
            <div class="min-w-0 max-w-full overflow-hidden">{props.titleSlot}</div>
          </Show>
        </div>
        <Show when={props.children || showMobileShellDesktopChrome()}>
          <div class="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {props.children}
            <Show when={props.children && showMobileShellDesktopChrome()}>
              <Separator orientation="vertical" class="mx-1 h-6" />
            </Show>
            <Show when={showMobileShellDesktopChrome()}>
              <ThemeSwitch withTooltip />
              <WindowControlButtons />
            </Show>
          </div>
        </Show>
      </div>
      <Show when={props.below}>
        <div
          ref={setBelowScrollRef}
          data-page-toolbar-below-scroll={props.belowHorizontalWheel ? '' : undefined}
          class={cn(
            'w-full min-w-0 max-w-full',
            props.belowHorizontalWheel && pageToolbarBelowScroll
          )}
        >
          {props.below}
        </div>
      </Show>
    </div>
  );
}
