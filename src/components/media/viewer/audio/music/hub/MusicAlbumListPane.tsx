/**
 * Hub 专辑发现页（对齐歌单页：PageShell + 源切换；仅 wy/kg 正式列表）
 */

import { For, Show, onMount, type Component } from 'solid-js';
import { Disc3 } from 'lucide-solid';
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
  ensureAlbumListLoaded,
  getMusicAlbumListState,
  loadMoreAlbumList,
  setAlbumListSource,
} from '@/stores/music-hub/discover-lists';
import { openAlbumBrowse } from '@/stores/music-hub/browse';
import type { AudioTrackSource } from '@/lib/media/audio/track-types';
import {
  hubBrowseSourceLabel,
  type HubBrowseSource,
} from '@/lib/media/audio/online/mf-plugin/hub-browse-sources';
import { cn } from '@/lib/utils';
import { SINGER_DISCOVER_SOURCES } from '@/components/media/viewer/audio/music/hub/MusicSingerListPane';

const ALBUM_DISCOVER_SOURCES = SINGER_DISCOVER_SOURCES;

function AlbumSourceToolbar() {
  const state = getMusicAlbumListState;
  return (
    <AppSelect
      value={state().source}
      onChange={(value) => {
        if (value != null) void setAlbumListSource(value as AudioTrackSource);
      }}
      options={ALBUM_DISCOVER_SOURCES}
      itemComponent={(itemProps) => (
        <AppSelectItem item={itemProps.item}>
          {hubBrowseSourceLabel(itemProps.item.rawValue as HubBrowseSource)}
        </AppSelectItem>
      )}
    >
      <AppSelectTrigger layout="compact" class="h-9 w-22 sm:w-24" aria-label="专辑来源">
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

export const MusicAlbumListPane: Component = () => {
  const state = getMusicAlbumListState;

  onMount(() => {
    if (!ALBUM_DISCOVER_SOURCES.includes(state().source as HubBrowseSource)) {
      void setAlbumListSource('wy');
    } else {
      void ensureAlbumListLoaded();
    }
  });

  return (
    <MusicHubPageShell
      section="album"
      scrollClass="overflow-hidden"
      toolbar={<AlbumSourceToolbar />}
      title="专辑"
      description="新碟与热门专辑（网易云 / 酷狗）"
    >
      <div class={cn('flex min-h-0 flex-1 flex-col gap-2 py-2', musicHubPageContentInsetClass)}>
        <Show when={state().error}>
          <p class="px-2 text-sm text-destructive">{state().error}</p>
        </Show>
        <Show when={state().loading && state().albums.length === 0}>
          <p class="py-12 text-center text-sm text-muted-foreground">加载中…</p>
        </Show>
        <ul class="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-4">
          <For each={state().albums}>
            {(item) => (
              <li>
                <button
                  type="button"
                  class="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/50"
                  onClick={() => void openAlbumBrowse(item.source, item.id)}
                >
                  <Show
                    when={item.coverUrl}
                    fallback={
                      <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">
                        <Disc3 class="h-4 w-4 text-muted-foreground" />
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
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm">{item.name}</span>
                    <span class="block truncate text-xs text-muted-foreground">{item.artist}</span>
                  </span>
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
                onClick={() => void loadMoreAlbumList()}
              >
                {state().loadingMore ? '加载中…' : '加载更多'}
              </Button>
            </li>
          </Show>
          <Show when={!state().loading && state().albums.length === 0 && !state().error}>
            <li class="py-12 text-center text-sm text-muted-foreground">暂无专辑</li>
          </Show>
        </ul>
      </div>
    </MusicHubPageShell>
  );
};
