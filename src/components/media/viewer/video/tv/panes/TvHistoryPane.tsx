import { For, Show, createResource, createSignal } from 'solid-js';
import { Button } from '@/components/ui/button';
import { TvHubPageShell } from '@/components/media/viewer/video/tv/hub/TvHubPageShell';
import { TvHubToolbarIconButton } from '@/components/media/viewer/video/tv/hub/TvHubToolbarIconButton';
import { tvHubPageContentInsetClass } from '@/lib/media/tv/tv-hub-section-meta';
import { TrashIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import * as TvDao from '@/lib/media/tv/db/tv-dao';
import { loadTvDetail } from '@/stores/tv-hub/detail';

export function TvHistoryPane() {
  const [tick, setTick] = createSignal(0);
  const [list] = createResource(
    () => tick(),
    () => TvDao.listHistory(80),
  );

  return (
    <TvHubPageShell
      section="history"
      toolbar={
        <TvHubToolbarIconButton
          label="清空历史"
          onClick={() => {
            void TvDao.clearHistory().then(() => setTick((n) => n + 1));
          }}
        >
          <TrashIcon class="h-4 w-4" />
        </TvHubToolbarIconButton>
      }
    >
      <Show when={list.loading}>
        <p class={cn('py-3 text-sm text-muted-foreground', tvHubPageContentInsetClass)}>
          加载中…
        </p>
      </Show>
      <div class={cn('flex flex-col gap-2 py-3', tvHubPageContentInsetClass)}>
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
    </TvHubPageShell>
  );
}
