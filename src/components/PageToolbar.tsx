/**
 * 主壳内 Tab 页的页面工具栏：标题 + 描述 | 操作区（左右垂直居中对齐）
 * 与 PageHeader（独立全屏页）区分，不含返回键与窗口控制。
 */

import { Show, type JSX } from 'solid-js';
import { useShellLayout } from '@/components/ShellLayoutProvider';
import { cn } from '@/lib/utils';

/** 标题+描述文本块：宽度取两行中较宽者（w-max），顶到上限后再省略 */
export function PageToolbarTitleText(props: {
  title: string;
  description?: string | JSX.Element;
  class?: string;
}) {
  return (
    <div class={cn('w-max max-w-full overflow-hidden text-left', props.class)}>
      <h2 class="overflow-hidden text-ellipsis whitespace-nowrap text-2xl font-bold leading-tight text-foreground">
        {props.title}
      </h2>
      <Show when={props.description}>
        <div class="overflow-hidden text-ellipsis whitespace-nowrap text-sm leading-snug text-muted-foreground">
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
  /** 第二行：分组筛选、标签 Tab 等 */
  below?: JSX.Element;
  /** 覆盖壳层默认：移动端布局时顶栏安全区 */
  insetTopSafeArea?: boolean;
  class?: string;
}

export function PageToolbar(props: PageToolbarProps) {
  const shell = useShellLayout();
  const insetTopSafeArea = () => props.insetTopSafeArea ?? shell().insetTopSafeArea;

  return (
    <div
      class={cn(
        'shrink-0 space-y-3 mb-2',
        insetTopSafeArea() && 'safe-area-inset-top',
        props.class
      )}
    >
      <div class="flex items-center justify-between gap-4">
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
            <div class="max-w-full w-fit">{props.titleSlot}</div>
          </Show>
        </div>
        <Show when={props.children}>
          <div class="flex shrink-0 flex-wrap items-center justify-end gap-2">{props.children}</div>
        </Show>
      </div>
      <Show when={props.below}>{props.below}</Show>
    </div>
  );
}
