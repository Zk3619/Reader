/**
 * 主壳内 Tab 页的页面工具栏：标题 + 描述 | 操作区（左右垂直居中对齐）
 * 与 PageHeader（独立全屏页）区分；桌面强制移动壳层且无顶栏时补侧栏触发与窗口 chrome。
 */

import { Show, createEffect, createSignal, onCleanup, type JSX } from 'solid-js';
import { useShellLayout } from '@/components/shell/ShellLayoutProvider';
import {
  PageToolbarShellTrailing,
  PageToolbarSidebarLeading,
} from '@/components/shell/PageToolbarShellChrome';
import {
  createTauriWindowChromeDblClickHandler,
  shouldEnableTauriWindowChrome,
} from '@/lib/platform/tauri-window-chrome';
import { shouldShowPageToolbarShellChrome } from '@/lib/shell/page-toolbar-shell-chrome';
import { cn } from '@/lib/utils';
import { pageToolbarBelowScroll, pageToolbarShellTop } from '@/lib/ui/viewport-classes';

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
  const enableTauriWindowChrome = () =>
    shouldEnableTauriWindowChrome(shell().useMobileShell);
  const showShellTrailingChrome = () => shouldShowPageToolbarShellChrome(shell());
  const onTauriWindowChromeDblClick = createTauriWindowChromeDblClickHandler();
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
        'flex w-full min-w-0 max-w-full shrink-0 flex-col space-y-3 overflow-x-hidden px-4',
        insetTopSafeArea() ? pageToolbarShellTop : 'pt-4',
        props.class
      )}
      data-tauri-drag-region={enableTauriWindowChrome() ? true : undefined}
      onDblClick={enableTauriWindowChrome() ? onTauriWindowChromeDblClick : undefined}
    >
      <div class="flex min-w-0 items-center justify-between gap-4">
        <div
          class="flex min-w-0 flex-1 items-center gap-3"
          data-tauri-drag-region={enableTauriWindowChrome() ? true : undefined}
        >
          <PageToolbarSidebarLeading />
          <Show when={props.leading}>
            <div class="flex shrink-0 items-center no-drag">{props.leading}</div>
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
        <Show when={props.children || showShellTrailingChrome()}>
          <div class="relative z-30 flex shrink-0 flex-wrap items-center justify-end gap-2 overflow-visible no-drag">
            <Show when={props.children}>{props.children}</Show>
            <PageToolbarShellTrailing showLeadingSeparator={!!props.children} />
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
