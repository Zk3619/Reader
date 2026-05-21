/**
 * 发现页书籍卡片骨架屏（与 exploreBookListCardClass / 网格断点一致）
 */

import { createSignal, onCleanup, onMount, For } from 'solid-js';
import {
  exploreBookListCardClass,
  exploreBookListCoverClass,
  exploreBookListBodyClass,
  exploreBookListBadgeRowClass,
  exploreBookListIntroWrapClass,
  exploreSkeletonPulseClass,
} from '@/lib/bookshelf/book-group-card-styles';
import { cn } from '@/lib/utils';

export const EXPLORE_BOOK_GRID_CLASS =
  'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2';

/** 各断点至少 3 行：1→4、md 2→6、lg 3→9、2xl 4→12 */
function resolveSkeletonCount(): number {
  if (typeof window === 'undefined') return 6;
  if (window.matchMedia('(min-width: 1536px)').matches) return 12;
  if (window.matchMedia('(min-width: 1024px)').matches) return 9;
  if (window.matchMedia('(min-width: 768px)').matches) return 6;
  return 4;
}

/** 随窗口宽度更新骨架数量，与 EXPLORE_BOOK_GRID_CLASS 列数对齐 */
export function useExploreSkeletonCount() {
  const [count, setCount] = createSignal(resolveSkeletonCount());

  onMount(() => {
    const sync = () => setCount(resolveSkeletonCount());
    const queries = ['(min-width: 768px)', '(min-width: 1024px)', '(min-width: 1536px)'].map(
      (q) => window.matchMedia(q),
    );
    for (const mq of queries) {
      mq.addEventListener('change', sync);
    }
    onCleanup(() => {
      for (const mq of queries) {
        mq.removeEventListener('change', sync);
      }
    });
  });

  return count;
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
  return (
    <ul class={EXPLORE_BOOK_GRID_CLASS} aria-busy="true" aria-label="加载书籍列表">
      <For each={Array.from({ length: count() }, (_, i) => i)}>
        {() => <ExploreBookCardSkeleton />}
      </For>
    </ul>
  );
}
