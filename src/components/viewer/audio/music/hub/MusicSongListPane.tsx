/**
 * Hub 在线歌单浏览
 */

import { createEffect, createSignal, For, Show, type Component } from 'solid-js';
import { Link2 } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import {
  closeSongListDetail,
  getSongListState,
  loadSongListPage,
  loadSongListTags,
  MUSIC_SDK_SOURCES,
  MUSIC_SDK_SOURCE_LABELS,
  openSongListDetail,
  setSongListSort,
  setSongListSource,
  setSongListTag,
} from '@/stores/music-hub/songList';
import { getSongListSorts } from '@/lib/media/audio/music-sdk';
import { MusicSongListDetail } from '@/components/viewer/audio/music/hub/MusicSongListDetail';
import { MusicOpenListDialog } from '@/components/viewer/audio/music/hub/MusicOpenListDialog';
import { cn } from '@/lib/utils';

export const MusicSongListPane: Component = () => {
  const state = getSongListState;
  const [openListOpen, setOpenListOpen] = createSignal(false);

  createEffect(() => {
    void loadSongListTags();
    void loadSongListPage(1);
  });

  const sorts = () => getSongListSorts(state().source);

  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Show
        when={!state().detail}
        fallback={
          <MusicSongListDetail onBack={() => closeSongListDetail()} />
        }
      >
        <div class="shrink-0 space-y-2 border-b p-4">
          <div class="flex flex-wrap items-center gap-2">
            <select
              class="rounded-md border bg-background px-2 py-1.5 text-sm"
              value={state().source}
              onChange={(e: Event) =>
                setSongListSource(
                  (e.currentTarget as HTMLSelectElement).value as ReturnType<
                    typeof getSongListState
                  >['source'],
                )
              }
            >
              <For each={MUSIC_SDK_SOURCES}>
                {(src) => <option value={src}>{MUSIC_SDK_SOURCE_LABELS[src]}</option>}
              </For>
            </select>
            <For each={sorts()}>
              {(sort) => (
                <button
                  type="button"
                  class={cn(
                    'rounded-lg px-2 py-1 text-sm',
                    state().sortId === sort.id ? 'bg-primary text-primary-foreground' : 'bg-muted',
                  )}
                  onClick={() => setSongListSort(sort.id)}
                >
                  {sort.name}
                </button>
              )}
            </For>
            <Button size="sm" variant="outline" onClick={() => setOpenListOpen(true)}>
              <Link2 class="mr-1 h-4 w-4" />
              打开链接
            </Button>
          </div>
          <Show when={state().hotTags.length > 0}>
            <div class="flex flex-wrap gap-1.5">
              <button
                type="button"
                class={cn(
                  'rounded-full px-2 py-0.5 text-xs',
                  state().tagId === null ? 'bg-primary text-primary-foreground' : 'bg-muted',
                )}
                onClick={() => setSongListTag(null)}
              >
                全部
              </button>
              <For each={state().hotTags}>
                {(tag) => (
                  <button
                    type="button"
                    class={cn(
                      'rounded-full px-2 py-0.5 text-xs',
                      state().tagId === tag.id ? 'bg-primary text-primary-foreground' : 'bg-muted',
                    )}
                    onClick={() => setSongListTag(tag.id)}
                  >
                    {tag.name}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          <Show when={state().loading}>
            <p class="text-sm text-muted-foreground">加载中…</p>
          </Show>
          <Show when={state().error}>
            <p class="text-sm text-destructive">{state().error}</p>
          </Show>
          <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <For each={state().playlists}>
              {(pl) => (
                <li>
                  <button
                    type="button"
                    class="flex w-full gap-3 rounded-lg border p-2 text-left hover:bg-muted"
                    onClick={() => void openSongListDetail(pl.id)}
                  >
                    <Show when={pl.coverUrl}>
                      <img src={pl.coverUrl} alt="" class="h-16 w-16 rounded object-cover" />
                    </Show>
                    <div class="min-w-0 flex-1">
                      <p class="line-clamp-2 font-medium">{pl.name}</p>
                      <p class="truncate text-xs text-muted-foreground">{pl.author}</p>
                      <Show when={pl.playCount}>
                        <p class="text-xs text-muted-foreground">{pl.playCount} 播放</p>
                      </Show>
                    </div>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>

      <MusicOpenListDialog open={openListOpen()} onOpenChange={setOpenListOpen} />
    </div>
  );
};
