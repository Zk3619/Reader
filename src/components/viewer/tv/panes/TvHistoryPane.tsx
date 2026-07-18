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

export function TvHistoryPane() {
  const [tick, setTick] = createSignal(0);
  const [list] = createResource(
    () => tick(),
    () => TvDao.listHistory(80),
  );

  return (
    <section class="flex min-h-0 flex-1 flex-col">
      <PageToolbar
        class={pageToolbarBottomBorder}
        title="历史"
        description="观看记录 · 续播进度"
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            void TvDao.clearHistory().then(() => setTick((n) => n + 1));
          }}
        >
          清空
        </Button>
      </PageToolbar>
      <div class={cn(mainShellPageScroll, 'flex flex-col gap-2 p-4')}>
        <Show when={list.loading}>
          <p class="text-sm text-muted-foreground">加载中…</p>
        </Show>
        <For each={list() ?? []}>
          {(item) => (
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-3 rounded-md border border-border/60 p-2 text-left hover:bg-muted/40"
                onClick={() => void loadTvDetail(item.siteKey, item.vodId)}
              >
                <div class="h-14 w-10 shrink-0 overflow-hidden rounded bg-muted">
                  <Show when={item.vodPic}>
                    <img src={item.vodPic} alt="" class="h-full w-full object-cover" />
                  </Show>
                </div>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium">{item.vodName}</p>
                  <p class="text-xs text-muted-foreground">
                    {item.flag} · {item.episode}
                    {item.position > 0
                      ? ` · ${Math.floor(item.position / 60)}:${String(Math.floor(item.position % 60)).padStart(2, '0')}`
                      : ''}
                  </p>
                </div>
              </button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  void TvDao.removeHistory(item.key).then(() => setTick((n) => n + 1));
                }}
              >
                删
              </Button>
            </div>
          )}
        </For>
      </div>
    </section>
  );
}
