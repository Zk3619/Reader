/**
 * Hub 排行榜浏览
 */

import { createEffect, For, Show, type Component } from 'solid-js';
import { Play } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import {
  getLeaderboardState,
  loadLeaderboardBoards,
  MUSIC_SDK_SOURCES,
  MUSIC_SDK_SOURCE_LABELS,
  selectLeaderboardBoard,
  setLeaderboardSource,
} from '@/stores/music-hub/leaderboard';
import { playPlaylist } from '@/stores/viewer/media/audio';
import { addTracksToPlaylist } from '@/lib/database/audio-library';
import { bindPlaylistToSource } from '@/lib/media/audio/list/sync-source-list';
import { BUILTIN_PLAYLIST_IDS } from '@/lib/media/audio/track-types';
import { cn } from '@/lib/utils';

export const MusicLeaderboardPane: Component = () => {
  const state = getLeaderboardState;

  createEffect(() => {
    void loadLeaderboardBoards();
  });

  const detail = () => state().detail;

  return (
    <div class="flex min-h-0 flex-1 overflow-hidden">
      <aside class="w-44 shrink-0 overflow-y-auto border-r p-2 md:w-52">
        <select
          class="mb-2 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          value={state().source}
          onChange={(e: Event) =>
            setLeaderboardSource(
              (e.currentTarget as HTMLSelectElement).value as ReturnType<
                typeof getLeaderboardState
              >['source'],
            )
          }
        >
          <For each={MUSIC_SDK_SOURCES}>
            {(src) => <option value={src}>{MUSIC_SDK_SOURCE_LABELS[src]}</option>}
          </For>
        </select>
        <ul class="space-y-0.5">
          <For each={state().boards}>
            {(board) => (
              <li>
                <button
                  type="button"
                  class={cn(
                    'w-full rounded-lg px-2 py-1.5 text-left text-sm',
                    state().selectedBoard?.id === board.id
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'hover:bg-muted',
                  )}
                  onClick={() => void selectLeaderboardBoard(board)}
                >
                  {board.name}
                </button>
              </li>
            )}
          </For>
        </ul>
      </aside>

      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <Show when={state().loading && !detail()}>
          <p class="p-4 text-sm text-muted-foreground">加载中…</p>
        </Show>
        <Show when={state().error}>
          <p class="p-4 text-sm text-destructive">{state().error}</p>
        </Show>
        <Show when={detail()}>
          {(d) => (
            <>
              <div class="flex shrink-0 items-center gap-2 border-b px-4 py-3">
                <p class="font-medium">{d().board.name}</p>
                <Button
                  size="sm"
                  onClick={() => void playPlaylist(d().tracks, 0)}
                  disabled={d().tracks.length === 0}
                >
                  <Play class="mr-1 h-4 w-4" />
                  播放全部
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await addTracksToPlaylist(BUILTIN_PLAYLIST_IDS.DEFAULT, d().tracks);
                    bindPlaylistToSource({
                      playlistId: BUILTIN_PLAYLIST_IDS.DEFAULT,
                      source: state().source,
                      type: 'leaderboard',
                      sourceId: d().board.bangId,
                    });
                  }}
                >
                  同步到我的列表
                </Button>
              </div>
              <ul class="min-h-0 flex-1 overflow-y-auto">
                <For each={d().tracks}>
                  {(track, i) => (
                    <li>
                      <button
                        type="button"
                        class="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted"
                        onClick={() => void playPlaylist(d().tracks, i())}
                      >
                        <span class="w-6 text-xs text-muted-foreground">{i() + 1}</span>
                        <span class="min-w-0 flex-1 truncate">{track.name}</span>
                        <span class="truncate text-sm text-muted-foreground">{track.artist}</span>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </>
          )}
        </Show>
        <Show when={!detail() && !state().loading}>
          <p class="p-4 text-sm text-muted-foreground">选择排行榜查看曲目</p>
        </Show>
      </div>
    </div>
  );
};
