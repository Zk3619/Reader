import { For, Show, createResource, createSignal } from 'solid-js';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  mainShellPageScroll,
  pageToolbarBottomBorder,
} from '@/lib/ui/viewport-classes';
import * as TvDao from '@/lib/media/tv/db/tv-dao';
import { loadTvDetail } from '@/stores/tv-hub/detail';

export function TvKeepPane() {
  const [tick, setTick] = createSignal(0);
  const [list] = createResource(
    () => tick(),
    () => TvDao.listKeep(),
  );

  return (
    <section class="flex min-h-0 flex-1 flex-col">
      <PageToolbar class={pageToolbarBottomBorder} title="收藏" description="点播收藏">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            void TvDao.clearKeep().then(() => setTick((n) => n + 1));
          }}
        >
          清空
        </Button>
      </PageToolbar>
      <div
        class={cn(
          mainShellPageScroll,
          'grid grid-cols-3 gap-3 p-4 sm:grid-cols-4 md:grid-cols-6',
        )}
      >
        <Show when={list.loading}>
          <p class="text-sm text-muted-foreground">加载中…</p>
        </Show>
        <For each={list() ?? []}>
          {(item) => (
            <div class="relative flex flex-col gap-1">
              <button
                type="button"
                class="flex flex-col gap-1 text-left"
                onClick={() => void loadTvDetail(item.siteKey, item.vodId)}
              >
                <div class="aspect-2/3 overflow-hidden rounded-md bg-muted">
                  <Show when={item.vodPic}>
                    <img src={item.vodPic} alt="" class="h-full w-full object-cover" />
                  </Show>
                </div>
                <span class="line-clamp-2 text-xs">{item.vodName}</span>
              </button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                class="absolute right-0 top-0 h-7 px-2"
                onClick={() => {
                  void TvDao.removeKeep(item.key).then(() => setTick((n) => n + 1));
                }}
              >
                ×
              </Button>
            </div>
          )}
        </For>
      </div>
    </section>
  );
}
