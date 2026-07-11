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
import { shouldShowBlockingLoading } from '@/lib/media/audio/music-loading-ui';
import { MusicAppSelect } from '@/components/viewer/audio/music/MusicAppSelect';
import { MusicHubPageShell } from '@/components/viewer/audio/music/hub/MusicHubPageShell';

export const MusicLeaderboardPane: Component = () => {
  const state = getLeaderboardState;

  createEffect(() => {
    void loadLeaderboardBoards();
  });

  const detail = () => state().detail;

  return (
    <MusicHubPageShell
      section="leaderboard"
      title={detail()?.board.name}
      description={detail() ? '排行榜曲目' : undefined}
      toolbar={
        <Show when={detail()}>
          {(d) => (
            <>
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
            </>
          )}
        </Show>
      }
      below={
        <div class="px-4 pb-2">
          <MusicAppSelect
            value={state().source}
            onChange={(v) =>
              setLeaderboardSource(
                v as ReturnType<typeof getLeaderboardState>['source'],
              )
            }
            options={MUSIC_SDK_SOURCES}
            optionLabel={(v) => MUSIC_SDK_SOURCE_LABELS[v as keyof typeof MUSIC_SDK_SOURCE_LABELS]}
            triggerClass="w-full max-w-xs"
            aria-label="音乐源"
          />
        </div>
      }
      scrollClass="overflow-hidden"
    >
      <div class="flex min-h-0 flex-1 overflow-hidden">
        <aside class="w-44 shrink-0 overflow-y-auto border-r border-border/50 p-2 md:w-52">
          <Show when={shouldShowBlockingLoading(state().loading, state().boards.length)}>
            <p class="px-2 py-2 text-sm text-muted-foreground">加载中…</p>
          </Show>
          <ul class="space-y-0.5">
            <For each={state().boards}>
              {(board) => (
                <li>
                  <Button
                    type="button"
                    variant="ghost"
                    class={cn(
                      'h-auto w-full justify-start rounded-lg px-2 py-1.5 text-left text-sm font-normal',
                      state().selectedBoard?.id === board.id
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-muted',
                    )}
                    onClick={() => void selectLeaderboardBoard(board)}
                  >
                    {board.name}
                  </Button>
                </li>
              )}
            </For>
          </ul>
        </aside>

        <div class="flex min-h-0 min-w-0 flex-1 flex-col pb-4">
          <Show when={shouldShowBlockingLoading(state().loading, detail() ? 1 : 0)}>
            <p class="p-4 text-sm text-muted-foreground">加载中…</p>
          </Show>
          <Show when={state().error}>
            <p class="p-4 text-sm text-destructive">{state().error}</p>
          </Show>
          <Show when={detail()}>
            {(d) => (
              <ul class={cn('min-h-0 flex-1 overflow-y-auto', state().loading && 'opacity-60')}>
                <For each={d().tracks}>
                  {(track, i) => (
                    <li>
                      <Button
                        type="button"
                        variant="ghost"
                        class="h-auto w-full justify-start gap-3 rounded-none px-4 py-2 font-normal"
                        onClick={() => void playPlaylist(d().tracks, i())}
                      >
                        <span class="w-6 text-xs text-muted-foreground">{i() + 1}</span>
                        <span class="min-w-0 flex-1 truncate">{track.name}</span>
                        <span class="truncate text-sm text-muted-foreground">{track.artist}</span>
                      </Button>
                    </li>
                  )}
                </For>
              </ul>
            )}
          </Show>
          <Show when={!detail() && !state().loading}>
            <p class="p-4 text-sm text-muted-foreground">选择排行榜查看曲目</p>
          </Show>
        </div>
      </div>
    </MusicHubPageShell>
  );
};
