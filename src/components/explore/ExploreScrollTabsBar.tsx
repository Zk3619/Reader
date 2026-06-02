/**
 * 探索页横滚 Tab 栏：Tabs + page-toolbar-below-scroll 视口
 */

import { createEffect, createSignal, onCleanup, type JSX } from 'solid-js';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { pageToolbarBelowScroll, pageToolbarBelowScrollTrack } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';

/** 书源 / 分类 Tab 区统一外壳（与 ExploreSectionsPanel 对齐） */
export const exploreTabBarShellClass =
  'shrink-0 bg-muted/10 py-1';

// /** 分类 Tab 区水平内边距（与 PageToolbar px-4 对齐） */
// export const exploreTabBarInsetClass = 'px-4';

export const exploreTabsListClass =
  'inline-flex h-9 w-max shrink-0 gap-0.5 rounded-md border-0 bg-muted p-1 text-muted-foreground shadow-none';

export const exploreTabsTriggerClass = cn(
  'shrink-0 max-w-48 truncate px-3 py-1.5 text-sm font-medium',
  'text-muted-foreground transition-colors',
  'hover:bg-background/70 hover:text-foreground',
  'data-selected:bg-background data-selected:text-foreground data-selected:shadow-sm',
);

export { TabsTrigger as ExploreTabsTrigger };

export interface ExploreScrollTabsBarProps {
  value: string;
  onChange: (value: string) => void;
  class?: string;
  /** 父级 PageToolbar 已提供横滚视口时设为 true（外壳由 PageToolbar 负边距包裹） */
  embedded?: boolean;
  /** 横滚轨内、Tabs 之前的节点（如分类筛选下拉） */
  leading?: JSX.Element;
  children: JSX.Element;
}

function ExploreTabsInner(props: {
  value: string;
  onChange: (value: string) => void;
  children: JSX.Element;
}) {
  return (
    <Tabs value={props.value} onChange={props.onChange} class="min-w-0 shrink-0">
      <TabsList class={exploreTabsListClass}>{props.children}</TabsList>
    </Tabs>
  );
}

export function ExploreScrollTabsBar(props: ExploreScrollTabsBarProps) {
  const [scrollRef, setScrollRef] = createSignal<HTMLDivElement | undefined>();

  createEffect(() => {
    if (props.embedded) return;
    const el = scrollRef();
    if (!el) return;
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

  if (props.embedded) {
    return (
      <ExploreTabsInner value={props.value} onChange={props.onChange}>
        {props.children}
      </ExploreTabsInner>
    );
  }

  return (
    <div class={cn(exploreTabBarShellClass, 'mx-4', props.class)}>
      <div ref={setScrollRef} class={pageToolbarBelowScroll}>
        <div class={pageToolbarBelowScrollTrack}>
          {props.leading}
          <ExploreTabsInner value={props.value} onChange={props.onChange}>
            {props.children}
          </ExploreTabsInner>
        </div>
      </div>
    </div>
  );
}
