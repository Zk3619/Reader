import { For, Show, createSignal } from 'solid-js';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  mainShellPageScroll,
  pageToolbarBottomBorder,
} from '@/lib/ui/viewport-classes';
import { getTvSearchState, submitTvSearch, loadTvDetail } from '@/stores/tv-hub/detail';

export function TvSearchPane() {
  const state = getTvSearchState();
  const [q, setQ] = createSignal(state.keyword);

  return (
    <section class="flex min-h-0 flex-1 flex-col">
      <PageToolbar class={pageToolbarBottomBorder} title="搜索" description="多站并行搜索" />
      <div class={cn(mainShellPageScroll, 'flex min-h-0 flex-1 flex-col gap-3 p-4')}>
        <form
          class="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submitTvSearch(q());
          }}
        >
          <input
            value={q()}
            onInput={(e) => setQ(e.currentTarget.value)}
            placeholder="输入片名"
            class="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm"
          />
          <Button type="submit" disabled={state.loading}>
            搜索
          </Button>
        </form>
        <Show when={state.error}>
          <p class="text-sm text-destructive">{state.error}</p>
        </Show>
        <Show when={state.loading}>
          <p class="text-sm text-muted-foreground">搜索中…</p>
        </Show>
        <div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          <For each={state.list}>
            {(vod) => (
              <button
                type="button"
                class="flex flex-col gap-1 text-left"
                onClick={() => void loadTvDetail(vod.siteKey || '', vod.vod_id)}
              >
                <div class="aspect-2/3 overflow-hidden rounded-md bg-muted">
                  <Show when={vod.vod_pic}>
                    <img src={vod.vod_pic} alt="" class="h-full w-full object-cover" loading="lazy" />
                  </Show>
                </div>
                <span class="line-clamp-2 text-xs">{vod.vod_name}</span>
                <span class="text-[10px] text-muted-foreground">{vod.siteName}</span>
              </button>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}
