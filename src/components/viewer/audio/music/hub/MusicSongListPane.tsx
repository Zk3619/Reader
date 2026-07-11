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
import { MusicAppSelect } from '@/components/viewer/audio/music/MusicAppSelect';
import { MusicHubPageShell } from '@/components/viewer/audio/music/hub/MusicHubPageShell';
import { MusicPlaylistVirtualList } from '@/components/viewer/audio/music/hub/MusicPlaylistVirtualList';
import { shouldShowBlockingLoading } from '@/lib/media/audio/music-loading-ui';

export const MusicSongListPane: Component = () => {
  const state = getSongListState;
  const [openListOpen, setOpenListOpen] = createSignal(false);

  createEffect(() => {
    void loadSongListTags();
    void loadSongListPage(1);
  });

  const sorts = () => getSongListSorts(state().source);

  return (
    <Show
      when={!state().detail}
      fallback={<MusicSongListDetail onBack={() => closeSongListDetail()} />}
    >
      <MusicHubPageShell
        section="songlist"
        scrollClass="overflow-hidden"
        toolbar={
          <Button size="sm" variant="outline" onClick={() => setOpenListOpen(true)}>
            <Link2 class="mr-1 h-4 w-4" />
            打开链接
          </Button>
        }
        below={
          <div class="space-y-2 px-4 pb-2">
            <div class="flex flex-wrap items-center gap-2">
              <MusicAppSelect
                value={state().source}
                onChange={(v) =>
                  setSongListSource(
                    v as ReturnType<typeof getSongListState>['source'],
                  )
                }
                options={MUSIC_SDK_SOURCES}
                optionLabel={(v) => MUSIC_SDK_SOURCE_LABELS[v as keyof typeof MUSIC_SDK_SOURCE_LABELS]}
                triggerClass="w-32"
                aria-label="音乐源"
              />
              <For each={sorts()}>
                {(sort) => (
                  <Button
                    type="button"
                    variant={state().sortId === sort.id ? 'default' : 'secondary'}
                    size="sm"
                    class="h-auto rounded-lg px-2 py-1"
                    onClick={() => setSongListSort(sort.id)}
                  >
                    {sort.name}
                  </Button>
                )}
              </For>
            </div>
            <Show when={state().hotTags.length > 0}>
              <div class="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant={state().tagId === null ? 'default' : 'secondary'}
                  size="sm"
                  class="h-auto rounded-full px-2 py-0.5 text-xs"
                  onClick={() => setSongListTag(null)}
                >
                  全部
                </Button>
                <For each={state().hotTags}>
                  {(tag) => (
                    <Button
                      type="button"
                      variant={state().tagId === tag.id ? 'default' : 'secondary'}
                      size="sm"
                      class="h-auto rounded-full px-2 py-0.5 text-xs"
                      onClick={() => setSongListTag(tag.id)}
                    >
                      {tag.name}
                    </Button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        }
      >
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4">
          <Show when={shouldShowBlockingLoading(state().loading, state().playlists.length)}>
            <p class="shrink-0 py-2 text-sm text-muted-foreground">加载中…</p>
          </Show>
          <Show when={state().error}>
            <p class="shrink-0 py-2 text-sm text-destructive">{state().error}</p>
          </Show>
          <Show when={state().playlists.length > 0}>
            <MusicPlaylistVirtualList
              class="min-h-0 flex-1"
              playlists={() => state().playlists}
              onOpen={(pl) => void openSongListDetail(pl.id)}
            />
          </Show>
        </div>
      </MusicHubPageShell>

      <MusicOpenListDialog open={openListOpen()} onOpenChange={setOpenListOpen} />
    </Show>
  );
};
