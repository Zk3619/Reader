/**
 * Hub 搜索面板（歌曲 + 歌单 Tab、热搜、历史）
 */

import { createEffect, createMemo, createSignal, For, onMount, Show, type Component } from 'solid-js';
import { SearchHistoryChip } from '@/components/bookshelf/SearchHistoryChip';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import {
  ensureLocalMusicSearchCache,
  filterLocalMusicLists,
  type LocalMusicSearchCache,
} from '@/lib/media/audio/music-local-search';
import { shouldShowBlockingLoading } from '@/lib/media/audio/music-loading-ui';
import { useSkeletonLoading } from '@/lib/hooks/useSkeletonLoading';
import {
  clearSearchHistory,
  getSearchState,
  refreshHotKeywords,
  removeSearchHistoryItem,
  scheduleTipSearch,
  cancelTipSearch,
  searchByKeyword,
} from '@/stores/music-hub/search';
import { AGGREGATE_SEARCH_SOURCE } from '@/lib/media/audio/online/source-router';
import { playPlaylist } from '@/stores/viewer/media/audio';
import { openSongListDetail, setSongListSource } from '@/stores/music-hub/songList';
import { setMusicSection } from '@/stores/viewer/media/audio';
import type { AudioTrackSource } from '@/lib/media/audio/track-types';
import { getMusicSearchUi } from '@/stores/music-hub/music-search-ui';
import { MusicHubPageShell } from '@/components/viewer/audio/music/hub/MusicHubPageShell';
import {
  MusicSearchPaneBelow,
  MusicSearchPaneToolbar,
} from '@/components/viewer/audio/music/hub/MusicSearchPaneToolbar';
import {
  MusicSearchLocalGroupList,
  MusicSearchPlaylistList,
  MusicSearchTrackList,
} from '@/components/viewer/audio/music/hub/MusicSearchResultLists';
import {
  MusicPlaylistGridSkeleton,
  MusicTrackListSkeleton,
} from '@/components/viewer/audio/music/hub/MusicHubSkeletons';
import { cn } from '@/lib/utils';

export const MusicSearchPane: Component = () => {
  const state = getSearchState;
  const ui = getMusicSearchUi;
  const showTrackSkeleton = useSkeletonLoading(() =>
    shouldShowBlockingLoading(state().loading, state().tracks.length),
  );
  const showPlaylistSkeleton = useSkeletonLoading(() =>
    shouldShowBlockingLoading(state().loading, state().playlists.length),
  );

  createEffect(() => {
    const src = state().source;
    if (src === AGGREGATE_SEARCH_SOURCE) {
      void refreshHotKeywords('wy');
      return;
    }
    if (typeof src === 'string' && !src.startsWith('userApi:')) {
      void refreshHotKeywords(src as AudioTrackSource);
    }
  });

  createEffect(() => {
    if (state().submitted) {
      cancelTipSearch();
      return;
    }
    scheduleTipSearch(state().keyword, state().source);
  });

  const [localCache, setLocalCache] = createSignal<LocalMusicSearchCache | null>(null);
  onMount(() => {
    void ensureLocalMusicSearchCache().then(setLocalCache);
  });

  const localHits = createMemo(() => {
    const data = localCache();
    if (!data) return [];
    const q = state().keyword.trim();
    if (state().submitted || !state().helpVisible || !q || state().tab !== 'song') return [];
    return filterLocalMusicLists(q, data);
  });

  const showWelcome = () => {
    if (!state().helpVisible || state().submitted || state().keyword.trim()) return false;
    const settings = getMusicSettings();
    const hasHistory = settings.searchHistoryEnabled && state().history.length > 0;
    const hasHot = state().hotKeywords.length > 0;
    return !hasHistory && !hasHot;
  };

  const showHistory = () =>
    state().helpVisible &&
    !state().submitted &&
    !state().keyword.trim() &&
    getMusicSettings().searchHistoryEnabled &&
    state().history.length > 0;

  const showHot = () =>
    getMusicSettings().searchHotEnabled &&
    state().helpVisible &&
    !state().submitted &&
    !state().keyword.trim();

  const showLocalMatches = () =>
    state().helpVisible &&
    !state().submitted &&
    !!state().keyword.trim() &&
    state().tab === 'song';

  const showOnlineResults = () => state().submitted;

  return (
    <MusicHubPageShell
      section="search"
      toolbar={<MusicSearchPaneToolbar />}
      below={
        ui().sourceControl === 'tabs' || ui().tabControl === 'tabs' ? (
          <MusicSearchPaneBelow />
        ) : undefined
      }
      belowHorizontalWheel={ui().sourceControl === 'tabs' || ui().tabControl === 'tabs'}
      scrollClass={showOnlineResults() ? 'overflow-hidden' : undefined}
    >
      <div
        class={cn(
          'flex min-h-0 w-full flex-1 flex-col',
          showOnlineResults() ? 'overflow-hidden' : 'gap-4 pb-4',
        )}
      >
        <Show when={showWelcome()}>
          <div class="flex flex-1 items-center justify-center py-16">
            <p class="text-center text-2xl text-muted-foreground">搜我所想~~😉</p>
          </div>
        </Show>

        <Show when={showHot() && state().hotKeywords.length > 0}>
          <section class="pt-1">
            <h3 class="mb-2 text-xs font-medium text-muted-foreground">热搜</h3>
            <div class="flex flex-wrap gap-2 pb-2">
              <For each={state().hotKeywords}>
                {(word) => (
                  <SearchHistoryChip
                    item={{ word, usage: 0, lastUseTime: 0 }}
                    onSelect={(selected) => {
                      void searchByKeyword(selected);
                    }}
                  />
                )}
              </For>
            </div>
          </section>
        </Show>

        <Show when={showHistory()}>
          <section class="pt-1">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="text-xs font-medium text-muted-foreground">搜索历史</h3>
              <button
                type="button"
                class="text-xs text-muted-foreground hover:text-foreground"
                onClick={clearSearchHistory}
              >
                清空
              </button>
            </div>
            <div class="flex flex-wrap gap-2 pb-4">
              <For each={state().history}>
                {(word) => (
                  <SearchHistoryChip
                    item={{ word, usage: 0, lastUseTime: 0 }}
                    onSelect={(selected) => {
                      void searchByKeyword(selected);
                    }}
                    onDelete={async (selected) => {
                      removeSearchHistoryItem(selected);
                    }}
                  />
                )}
              </For>
            </div>
          </section>
        </Show>

        <Show when={showLocalMatches()}>
          <section class="pt-1">
            <Show when={localCache()}>
              <Show
                when={localHits().length > 0}
                fallback={
                  <p class="py-2 text-sm text-muted-foreground">各列表中没有匹配歌曲</p>
                }
              >
                <MusicSearchLocalGroupList
                  groups={localHits()}
                  onPlay={(tracks, index) =>
                    void playPlaylist(tracks, index, {
                      origin: 'list',
                      listName: '本地匹配',
                      listKind: 'temporary',
                    })
                  }
                />
              </Show>
            </Show>
          </section>
        </Show>

        <Show
          when={
            state().helpVisible &&
            !state().submitted &&
            !!state().keyword.trim() &&
            state().tab === 'playlist'
          }
        >
          <p class="py-2 text-sm text-muted-foreground">按回车搜索在线歌单</p>
        </Show>

        <Show when={showOnlineResults()}>
          <Show when={state().tab === 'song'}>
            <Show
              when={state().tracks.length > 0}
              fallback={
                <Show when={showTrackSkeleton()}>
                  <MusicTrackListSkeleton class="min-h-0 flex-1 overflow-hidden" />
                </Show>
              }
            >
              <div class="relative flex min-h-0 flex-1 flex-col">
                <MusicSearchTrackList
                  class={cn('min-h-0 flex-1', state().loading && 'opacity-60')}
                  tracks={state().tracks}
                  source={state().source}
                  onPlay={(tracks, index) =>
                    void playPlaylist(tracks, index, {
                      origin: 'search',
                      listName: `搜索：${state().keyword.trim() || '结果'}`,
                      listKind: 'search',
                    })
                  }
                />
              </div>
            </Show>
            <Show when={!state().loading && state().tracks.length === 0 && state().keyword && !showTrackSkeleton()}>
              <p class="py-12 text-center text-sm text-muted-foreground">无结果</p>
            </Show>
          </Show>
          <Show when={state().tab === 'playlist'}>
            <Show
              when={state().playlists.length > 0}
              fallback={
                <Show when={showPlaylistSkeleton()}>
                  <MusicPlaylistGridSkeleton class="min-h-0 flex-1 overflow-y-auto" />
                </Show>
              }
            >
              <div class="relative flex min-h-0 flex-1 flex-col">
                <MusicSearchPlaylistList
                  class={cn('min-h-0 flex-1', state().loading && 'opacity-60')}
                  playlists={state().playlists}
                  source={state().source}
                  onOpen={(pl) => {
                    setSongListSource(pl.source);
                    void openSongListDetail(pl.id);
                    setMusicSection('songlist');
                  }}
                />
              </div>
            </Show>
            <Show when={!state().loading && state().playlists.length === 0 && state().keyword && !showPlaylistSkeleton()}>
              <p class="py-12 text-center text-sm text-muted-foreground">无结果</p>
            </Show>
          </Show>
        </Show>
      </div>
    </MusicHubPageShell>
  );
};
