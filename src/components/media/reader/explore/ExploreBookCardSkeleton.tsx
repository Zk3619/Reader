/**
 * 发现页书籍卡片骨架屏（与 exploreBookListCardClass / 网格断点一致）
 */

import { For } from 'solid-js';
import {
  exploreBookListCardClass,
  exploreBookListCoverClass,
  exploreBookListBodyClass,
  exploreBookListBadgeRowClass,
  exploreBookListIntroWrapClass,
  exploreSkeletonPulseClass,
  bookGroupGridCardClass,
  bookGroupGridCoverClass,
} from '@/lib/bookshelf/book-group-card-styles';
import {
  EXPLORE_RESPONSIVE_CARD_HEIGHT_PX,
  EXPLORE_RESPONSIVE_GRID_CLASS,
  EXPLORE_RESPONSIVE_GRID_GAP_PX,
  EXPLORE_RESPONSIVE_ROW_HEIGHT_PX,
  getExploreListColumnCount,
  getExploreListGridClass,
  resolveExploreResponsiveColumnCount,
  useExploreResponsiveColumnCount,
} from '@/lib/explore/explore-list-layout';
import { explorePageLayoutStore } from '@/stores/explore-page-layout';
import { cn } from '@/lib/utils';

export {
  EXPLORE_RESPONSIVE_GRID_CLASS,
  EXPLORE_RESPONSIVE_CARD_HEIGHT_PX,
  EXPLORE_RESPONSIVE_GRID_GAP_PX,
  EXPLORE_RESPONSIVE_ROW_HEIGHT_PX,
  resolveExploreResponsiveColumnCount,
  useExploreResponsiveColumnCount,
};

function useExploreSkeletonCount() {
  const settings = () => explorePageLayoutStore.settings;
  const responsiveCols = useExploreResponsiveColumnCount();
  const cols = () => {
    if (settings().dataLayoutMode === 'default') return responsiveCols();
    return getExploreListColumnCount(settings());
  };
  return () => cols() * 3;
}

function ExploreBookTextSkeleton() {
  return (
    <li class="w-full list-none border-b border-border/30 px-3 py-2" aria-hidden="true">
      <div class={cn(exploreSkeletonPulseClass, 'h-4 w-[60%]')} />
      <div class={cn(exploreSkeletonPulseClass, 'mt-2 h-3 w-[40%]')} />
    </li>
  );
}

function ExploreBookGridSkeleton() {
  return (
    <li class="w-full list-none" aria-hidden="true">
      <div class={cn(bookGroupGridCardClass(), 'pointer-events-none border-border/60 shadow-none')}>
        <div class={cn(bookGroupGridCoverClass(), exploreSkeletonPulseClass)} />
        <div class={cn(exploreSkeletonPulseClass, 'h-4 w-[80%]')} />
        <div class={cn(exploreSkeletonPulseClass, 'h-3 w-[55%]')} />
      </div>
    </li>
  );
}

export function ExploreBookCardSkeleton() {
  return (
    <li class="w-full list-none">
      <div
        class={exploreBookListCardClass(
          'pointer-events-none border-border/60 shadow-none hover:shadow-none',
        )}
        aria-hidden="true"
      >
        <div class={exploreBookListCoverClass(exploreSkeletonPulseClass)} />
        <div class={exploreBookListBodyClass()}>
          <div class={cn(exploreSkeletonPulseClass, 'h-5 w-[78%]')} />
          <div class={cn(exploreSkeletonPulseClass, 'h-3 w-[55%]')} />
          <div class={cn(exploreSkeletonPulseClass, 'h-3 w-[72%]')} />
          <div class={exploreBookListBadgeRowClass()}>
            <div class={cn(exploreSkeletonPulseClass, 'h-5 w-12 shrink-0')} />
            <div class={cn(exploreSkeletonPulseClass, 'h-5 w-16 shrink-0')} />
            <div class={cn(exploreSkeletonPulseClass, 'h-5 min-w-0 flex-1')} />
          </div>
          <div class={exploreBookListIntroWrapClass()}>
            <div class="flex min-h-0 flex-1 flex-col justify-start gap-1.5">
              <div class={cn(exploreSkeletonPulseClass, 'h-3 w-full shrink-0')} />
              <div class={cn(exploreSkeletonPulseClass, 'h-3 w-[88%] shrink-0')} />
              <div class={cn(exploreSkeletonPulseClass, 'h-3 w-[72%] shrink-0')} />
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

export function ExploreBookListSkeleton() {
  const count = useExploreSkeletonCount();
  const settings = () => explorePageLayoutStore.settings;
  const gridClass = () => getExploreListGridClass(settings());
  const layoutMode = () => settings().dataLayoutMode;

  return (
    <ul
      class={cn(gridClass(), layoutMode() === 'text-list' ? 'py-0 px-0' : 'py-2 px-1')}
      aria-busy="true"
      aria-label="加载书籍列表"
    >
      <For each={Array.from({ length: count() }, (_, i) => i)}>
        {() => {
          if (layoutMode() === 'text-list') return <ExploreBookTextSkeleton />;
          if (layoutMode() === 'card-grid') return <ExploreBookGridSkeleton />;
          return <ExploreBookCardSkeleton />;
        }}
      </For>
    </ul>
  );
}
