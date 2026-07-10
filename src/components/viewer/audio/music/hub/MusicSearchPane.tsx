/**
 * Hub 搜索面板（歌曲 + 歌单 Tab、热搜、历史）
 */

import { createEffect, For, Show, type Component } from 'solid-js';
import { Search } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import {
  clearSearchHistory,
  getSearchState,
  refreshHotKeywords,
  runSearch,
  scheduleTipSearch,
  setSearchKeyword,
  setSearchSource,
  setSearchTab,
  listSearchSources,
  BUILTIN_SOURCE_LABELS,
} from '@/stores/music-hub/search';
import type { SearchSource } from '@/lib/media/audio/online/source-router';
import { playPlaylist } from '@/stores/viewer/media/audio';
import { openSongListDetail, setSongListSource } from '@/stores/music-hub/songList';
import { setMusicSection } from '@/stores/viewer/media/audio';
import type { AudioTrackSource } from '@/lib/media/audio/track-types';
import { cn } from '@/lib/utils';

export const MusicSearchPane: Component = () => {
  const state = getSearchState;

  createEffect(() => {
    const src = state().source;
    if (typeof src === 'string' && !src.startsWith('userApi:')) {
      void refreshHotKeywords(src as AudioTrackSource);
    }
  });

  const sourceLabel = (id: string) =>
    BUILTIN_SOURCE_LABELS[id] ?? (id.startsWith('userApi:') ? '自定义源' : id);

  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div class="shrink-0 space-y-3 border-b p-4">
        <div class="flex gap-2">
          {(['song', 'playlist'] as const).map((tab) => (
            <button
              type="button"
              class={cn(
                'rounded-lg px-3 py-1.5 text-sm',
                state().tab === tab ? 'bg-primary text-primary-foreground' : 'bg-muted',
              )}
              onClick={() => setSearchTab(tab)}
            >
              {tab === 'song' ? '歌曲' : '歌单'}
            </button>
          ))}
        </div>
        <div class="flex gap-2">
          <select
            class="rounded-md border bg-background px-2 py-1.5 text-sm"
            value={state().source}
            onChange={(e: Event) =>
              setSearchSource((e.currentTarget as HTMLSelectElement).value as SearchSource)
            }
          >
            <For each={listSearchSources()}>
              {(src) => (
                <option value={src}>
                  {typeof src === 'string' && !src.startsWith('userApi:')
                    ? sourceLabel(src)
                    : '自定义源'}
                </option>
              )}
            </For>
          </select>
          <input
            class="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
            placeholder={state().tab === 'song' ? '搜索歌曲' : '搜索歌单'}
            value={state().keyword}
            onInput={(e: InputEvent) => {
              const value = (e.currentTarget as HTMLInputElement).value;
              setSearchKeyword(value);
              scheduleTipSearch(value, state().source);
            }}
            onKeyDown={(e: KeyboardEvent) => e.key === 'Enter' && void runSearch()}
          />
          <Button onClick={() => void runSearch()}>
            <Search class="h-4 w-4" />
          </Button>
        </div>
        <Show when={state().tipKeywords.length > 0 && state().keyword.trim().length >= 2}>
          <ul class="rounded-md border bg-popover text-sm shadow-sm">
            <For each={state().tipKeywords}>
              {(word) => (
                <li>
                  <button
                    type="button"
                    class="w-full px-3 py-2 text-left hover:bg-muted"
                    onClick={() => {
                      setSearchKeyword(word);
                      void runSearch();
                    }}
                  >
                    {word}
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={state().hotKeywords.length > 0}>
          <div class="flex flex-wrap gap-1.5">
            <For each={state().hotKeywords}>
              {(word) => (
                <button
                  type="button"
                  class="rounded-full bg-muted px-2 py-0.5 text-xs hover:bg-muted/80"
                  onClick={() => {
                    setSearchKeyword(word);
                    void runSearch();
                  }}
                >
                  {word}
                </button>
              )}
            </For>
          </div>
        </Show>
        <Show when={state().history.length > 0}>
          <div class="flex items-center gap-2 text-xs text-muted-foreground">
            <span>历史</span>
            <button type="button" class="hover:text-foreground" onClick={clearSearchHistory}>
              清空
            </button>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <For each={state().history}>
              {(word) => (
                <button
                  type="button"
                  class="rounded-full border px-2 py-0.5 text-xs hover:bg-muted"
                  onClick={() => {
                    setSearchKeyword(word);
                    void runSearch();
                  }}
                >
                  {word}
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-4">
        <Show when={state().loading}>
          <p class="text-sm text-muted-foreground">搜索中…</p>
        </Show>
        <Show when={state().error}>
          <p class="text-sm text-destructive">{state().error}</p>
        </Show>
        <Show when={!state().loading && state().tab === 'song' && state().tracks.length === 0 && state().keyword}>
          <p class="text-sm text-muted-foreground">无结果</p>
        </Show>
        <Show when={state().tab === 'song'}>
          <ul class="space-y-1">
            <For each={state().tracks}>
              {(track, i) => (
                <li>
                  <button
                    type="button"
                    class="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted"
                    onClick={() => void playPlaylist(state().tracks, i())}
                  >
                    <span class="min-w-0 flex-1 truncate">{track.name}</span>
                    <span class="truncate text-sm text-muted-foreground">{track.artist}</span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={state().tab === 'playlist'}>
          <ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <For each={state().playlists}>
              {(pl) => (
                <li>
                  <button
                    type="button"
                    class="flex w-full gap-3 rounded-lg border p-2 text-left hover:bg-muted"
                    onClick={() => {
                      setSongListSource(pl.source);
                      void openSongListDetail(pl.id);
                      setMusicSection('songlist');
                    }}
                  >
                    <Show when={pl.coverUrl}>
                      <img src={pl.coverUrl} alt="" class="h-14 w-14 rounded object-cover" />
                    </Show>
                    <div class="min-w-0 flex-1">
                      <p class="truncate font-medium">{pl.name}</p>
                      <p class="truncate text-xs text-muted-foreground">{pl.author}</p>
                    </div>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </div>
  );
};
