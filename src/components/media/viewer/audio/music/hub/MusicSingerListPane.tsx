/**
 * Hub 歌手发现页（对齐歌单页：PageShell + 源切换；仅 wy/kg 正式列表）
 */

import { For, Show, createEffect, onMount, type Component } from 'solid-js';
import { Mic2 } from 'lucide-solid';
import {
  AppSelect,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { ViewerAppSelectContent } from '@/components/media/viewer/viewer-app-overlay';
import { Button } from '@/components/ui/button';
import { MusicHubPageShell } from '@/components/media/viewer/audio/music/hub/MusicHubPageShell';
import { musicHubPageContentInsetClass } from '@/lib/media/audio/music-hub-section-meta';
import {
  ensureSingerListLoaded,
  getMusicSingerListState,
  loadMoreSingerList,
  setSingerListSource,
} from '@/stores/music-hub/discover-lists';
import { openSingerBrowse } from '@/stores/music-hub/browse';
import type { AudioTrackSource } from '@/lib/media/audio/track-types';
import {
  hubBrowseSourceLabel,
  type HubBrowseSource,
} from '@/lib/media/audio/online/mf-plugin/hub-browse-sources';
import { cn } from '@/lib/utils';

/** 具备完整发现列表 API 的源 */
export const SINGER_DISCOVER_SOURCES: HubBrowseSource[] = ['wy', 'kg'];

function SingerSourceToolbar() {
  const state = getMusicSingerListState;
  return (
    <AppSelect
      value={state().source}
      onChange={(value) => {
        if (value != null) void setSingerListSource(value as AudioTrackSource);
      }}
      options={SINGER_DISCOVER_SOURCES}
      itemComponent={(itemProps) => (
        <AppSelectItem item={itemProps.item}>
          {hubBrowseSourceLabel(itemProps.item.rawValue as HubBrowseSource)}
        </AppSelectItem>
      )}
    >
      <AppSelectTrigger layout="compact" class="h-9 w-22 sm:w-24" aria-label="歌手来源">
        <AppSelectValue>
          {(selectState) => {
            const raw = selectState.selectedOption();
            return raw != null ? hubBrowseSourceLabel(raw as HubBrowseSource) : '';
          }}
        </AppSelectValue>
        <AppSelectIcon />
      </AppSelectTrigger>
      <ViewerAppSelectContent>
        <AppSelectListbox />
      </ViewerAppSelectContent>
    </AppSelect>
  );
}

export const MusicSingerListPane: Component = () => {
  const state = getMusicSingerListState;

  onMount(() => {
    // 仅正式列表源
    if (!SINGER_DISCOVER_SOURCES.includes(state().source as HubBrowseSource)) {
      void setSingerListSource('wy');
    } else {
      void ensureSingerListLoaded();
    }
  });

  createEffect(() => {
    void state().source;
  });

  return (
    <MusicHubPageShell
      section="artist"
      scrollClass="overflow-hidden"
      toolbar={<SingerSourceToolbar />}
      title="歌手"
      description="热门歌手列表（网易云 / 酷狗）"
    >
      <div class={cn('flex min-h-0 flex-1 flex-col gap-2 py-2', musicHubPageContentInsetClass)}>
        <Show when={state().error}>
          <p class="px-2 text-sm text-destructive">{state().error}</p>
        </Show>
        <Show when={state().loading && state().singers.length === 0}>
          <p class="py-12 text-center text-sm text-muted-foreground">加载中…</p>
        </Show>
        <ul class="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-4">
          <For each={state().singers}>
            {(item) => (
              <li>
                <button
                  type="button"
                  class="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/50"
                  onClick={() => void openSingerBrowse(item.source, item.id, item.name)}
                >
                  <Show
                    when={item.coverUrl}
                    fallback={
                      <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">
                        <Mic2 class="h-4 w-4 text-muted-foreground" />
                      </span>
                    }
                  >
                    <img
                      src={item.coverUrl}
                      alt=""
                      class="h-10 w-10 shrink-0 rounded object-cover"
                      loading="lazy"
                    />
                  </Show>
                  <span class="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                </button>
              </li>
            )}
          </For>
          <Show when={state().hasMore}>
            <li class="py-3 text-center">
              <Button
                size="sm"
                variant="outline"
                disabled={state().loadingMore}
                onClick={() => void loadMoreSingerList()}
              >
                {state().loadingMore ? '加载中…' : '加载更多'}
              </Button>
            </li>
          </Show>
          <Show when={!state().loading && state().singers.length === 0 && !state().error}>
            <li class="py-12 text-center text-sm text-muted-foreground">暂无歌手</li>
          </Show>
        </ul>
      </div>
    </MusicHubPageShell>
  );
};
