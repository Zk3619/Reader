/**
 * 订阅模块骨架屏：发现 / 管理 / 首页列表
 */

import { For } from 'solid-js';
import { cn } from '@/lib/utils';
import { exploreSkeletonPulseClass } from '@/lib/bookshelf/book-group-card-styles';

export function SubscribeDiscoverTrendingSkeleton(props: { count?: number }) {
  const count = () => props.count ?? 8;
  return (
    <div class="space-y-2" aria-hidden>
      <For each={Array.from({ length: count() })}>
        {() => (
          <div class="flex h-18 items-center gap-3 rounded-xl border bg-card/40 px-3">
            <div class={cn(exploreSkeletonPulseClass, 'h-9 w-9 rounded-md')} />
            <div class="min-w-0 flex-1 space-y-2">
              <div class={cn(exploreSkeletonPulseClass, 'h-3.5 w-40')} />
              <div class={cn(exploreSkeletonPulseClass, 'h-3 w-64 max-w-full')} />
              <div class={cn(exploreSkeletonPulseClass, 'h-2.5 w-28')} />
            </div>
            <div class={cn(exploreSkeletonPulseClass, 'h-8 w-16 rounded-md')} />
          </div>
        )}
      </For>
    </div>
  );
}

export function SubscribeDiscoverCategoriesSkeleton(props: { count?: number }) {
  const count = () => props.count ?? 3;
  return (
    <div class="space-y-3" aria-hidden>
      <For each={Array.from({ length: count() })}>
        {() => (
          <section class="overflow-hidden rounded-xl border bg-card/40">
            <div class="flex items-center gap-3 border-b px-3 py-2.5">
              <div class={cn(exploreSkeletonPulseClass, 'h-8 w-8 rounded-md')} />
              <div class="min-w-0 flex-1 space-y-2">
                <div class={cn(exploreSkeletonPulseClass, 'h-3.5 w-32')} />
                <div class={cn(exploreSkeletonPulseClass, 'h-2.5 w-48')} />
              </div>
            </div>
            <div class="space-y-2 px-3 py-3">
              <For each={[0, 1, 2]}>
                {() => (
                  <div class="flex items-center gap-2">
                    <div class="min-w-0 flex-1 space-y-1.5">
                      <div class={cn(exploreSkeletonPulseClass, 'h-3 w-40')} />
                      <div class={cn(exploreSkeletonPulseClass, 'h-2.5 w-56 max-w-full')} />
                    </div>
                    <div class={cn(exploreSkeletonPulseClass, 'h-7 w-14 rounded-md')} />
                  </div>
                )}
              </For>
            </div>
          </section>
        )}
      </For>
    </div>
  );
}

export function SubscribeManageListSkeleton(props: { count?: number }) {
  const count = () => props.count ?? 8;
  return (
    <ul class="space-y-2" aria-hidden>
      <For each={Array.from({ length: count() })}>
        {() => (
          <li class="flex items-center gap-3 rounded-xl border bg-card/40 px-4 py-3">
            <div class={cn(exploreSkeletonPulseClass, 'h-9 w-9 rounded-md')} />
            <div class="min-w-0 flex-1 space-y-2">
              <div class={cn(exploreSkeletonPulseClass, 'h-3.5 w-44')} />
              <div class={cn(exploreSkeletonPulseClass, 'h-3 w-56 max-w-full')} />
            </div>
            <div class={cn(exploreSkeletonPulseClass, 'h-6 w-11 rounded-full')} />
          </li>
        )}
      </For>
    </ul>
  );
}

export function SubscribeHomeEntryListSkeleton(props: { count?: number }) {
  const count = () => props.count ?? 8;
  return (
    <div class="flex h-full min-h-0 flex-1 flex-col" aria-hidden>
      <For each={Array.from({ length: count() })}>
        {() => (
          <div class="border-b px-3 py-3">
            <div class="mb-2 flex items-center gap-2">
              <div class={cn(exploreSkeletonPulseClass, 'h-4 w-4 rounded')} />
              <div class={cn(exploreSkeletonPulseClass, 'h-2.5 w-20')} />
              <div class={cn(exploreSkeletonPulseClass, 'h-2.5 w-12')} />
            </div>
            <div class={cn(exploreSkeletonPulseClass, 'mb-1.5 h-3.5 w-72 max-w-full')} />
            <div class={cn(exploreSkeletonPulseClass, 'h-3 w-52 max-w-full')} />
          </div>
        )}
      </For>
    </div>
  );
}

export function SubscribeSettingsFormSkeleton() {
  return (
    <div class="space-y-4 px-1" aria-hidden>
      <For each={[0, 1, 2]}>
        {() => (
          <div class="space-y-2 rounded-xl border bg-card/40 p-4">
            <div class={cn(exploreSkeletonPulseClass, 'h-3.5 w-28')} />
            <div class={cn(exploreSkeletonPulseClass, 'h-3 w-full max-w-md')} />
            <div class={cn(exploreSkeletonPulseClass, 'h-9 w-full max-w-sm rounded-md')} />
          </div>
        )}
      </For>
    </div>
  );
}
