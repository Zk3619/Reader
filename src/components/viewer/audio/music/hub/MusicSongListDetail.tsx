/**
 * 在线歌单详情（对齐 lx-music 封面 + 简介 + 在线曲目列表）
 */

import { Show, createSignal, type Component } from 'solid-js';
import { Music2 } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { SettingsToolbarLeading } from '@/components/shell/SettingsPageToolbar';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { BookCoverPreviewDialog } from '@/components/books/BookCoverPreviewDialog';
import { PlayIcon, PlusIcon } from '@/components/shared/icons';
import { getSongListState } from '@/stores/music-hub/songList';
import { playAsTemp } from '@/stores/viewer/media/audio';
import { addTracksToPlaylist } from '@/lib/database/audio-library';
import { BUILTIN_PLAYLIST_IDS } from '@/lib/media/audio/track-types';
import { musicHubPageContentInsetClass } from '@/lib/media/audio/music-hub-section-meta';
import { MusicHubPageShell } from '@/components/viewer/audio/music/hub/MusicHubPageShell';
import { MusicOnlineTrackList } from '@/components/viewer/audio/music/hub/MusicSearchResultLists';
import { cn } from '@/lib/utils';

export interface MusicSongListDetailProps {
  onBack: () => void;
}

function DetailCover(props: {
  coverUrl?: string;
  playCount?: string;
  name: string;
  onPreview: () => void;
}) {
  const hasCover = () => !!props.coverUrl?.trim();

  return (
    <Button
      type="button"
      variant="ghost"
      disabled={!hasCover()}
      onClick={() => {
        if (hasCover()) props.onPreview();
      }}
      class={cn(
        'relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted p-0 shadow-sm',
        'hover:bg-transparent',
        hasCover() && 'cursor-zoom-in transition-transform hover:scale-[1.02] active:scale-[0.98]',
      )}
      aria-label={hasCover() ? '查看封面大图' : undefined}
    >
      <Show
        when={hasCover()}
        fallback={
          <div class="flex h-full w-full items-center justify-center text-muted-foreground">
            <Music2 class="h-8 w-8 opacity-40" />
          </div>
        }
      >
        <img
          src={props.coverUrl}
          alt={props.name}
          class="h-full w-full object-cover"
          loading="lazy"
          draggable={false}
        />
      </Show>
      <Show when={props.playCount?.trim()}>
        <span class="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/50 px-1 py-0.5 text-right text-[10px] text-white">
          {props.playCount}
        </span>
      </Show>
    </Button>
  );
}

export const MusicSongListDetail: Component<MusicSongListDetailProps> = (props) => {
  const state = getSongListState;
  const detail = () => state().detail;
  const [coverPreviewOpen, setCoverPreviewOpen] = createSignal(false);
  const metaLine = () => {
    const d = detail();
    if (!d) return '';
    return [d.info.author, d.tracks.length ? `${d.tracks.length} 首` : '']
      .filter(Boolean)
      .join(' · ');
  };

  return (
    <Show when={detail()}>
      {(d) => (
        <>
          <MusicHubPageShell
            section="songlist"
            title={d().info.name}
            description={metaLine() || '在线歌单'}
            leading={<SettingsToolbarLeading onBack={props.onBack} />}
            scrollClass="overflow-hidden"
            toolbar={
              <>
                <AppTooltip>
                  <AppTooltipTrigger
                    as={Button}
                    variant="ghost"
                    size="icon"
                    class="h-9 w-9 shrink-0"
                    onClick={() =>
                      void playAsTemp(d().tracks, 0, {
                        listName: d().info.name,
                        listKind: 'online-playlist',
                      })
                    }
                    disabled={d().tracks.length === 0}
                  >
                    <PlayIcon class="h-4 w-4" />
                    <span class="sr-only">播放全部</span>
                  </AppTooltipTrigger>
                  <AppTooltipContent>播放全部</AppTooltipContent>
                </AppTooltip>
                <AppTooltip>
                  <AppTooltipTrigger
                    as={Button}
                    variant="ghost"
                    size="icon"
                    class="h-9 w-9 shrink-0"
                    disabled={d().tracks.length === 0}
                    onClick={() =>
                      void addTracksToPlaylist(BUILTIN_PLAYLIST_IDS.DEFAULT, d().tracks)
                    }
                  >
                    <PlusIcon class="h-4 w-4" />
                    <span class="sr-only">添加到列表</span>
                  </AppTooltipTrigger>
                  <AppTooltipContent>添加到列表</AppTooltipContent>
                </AppTooltip>
              </>
            }
          >
            <div
              class={cn(
                'flex min-h-0 flex-1 flex-col overflow-hidden',
                musicHubPageContentInsetClass,
              )}
            >
              <div class="flex shrink-0 gap-3 border-b py-3">
                <DetailCover
                  coverUrl={d().info.coverUrl}
                  playCount={d().info.playCount}
                  name={d().info.name}
                  onPreview={() => setCoverPreviewOpen(true)}
                />
                <div class="min-w-0 flex-1">
                  <Show when={d().info.author?.trim()}>
                    <p class="truncate text-sm text-muted-foreground">{d().info.author}</p>
                  </Show>
                  <Show
                    when={d().info.desc?.trim()}
                    fallback={
                      <p class="mt-1 text-xs text-muted-foreground/70">暂无简介</p>
                    }
                  >
                    <AppTooltip>
                      <AppTooltipTrigger
                        as="p"
                        class="mt-1 line-clamp-3 cursor-default text-left text-xs leading-snug text-muted-foreground"
                      >
                        {d().info.desc}
                      </AppTooltipTrigger>
                      <AppTooltipContent class="max-w-sm whitespace-pre-wrap">
                        {d().info.desc}
                      </AppTooltipContent>
                    </AppTooltip>
                  </Show>
                </div>
              </div>

              <Show when={state().detailLoading}>
                <p class="shrink-0 py-2 text-sm text-muted-foreground">加载中…</p>
              </Show>
              <Show when={state().error}>
                <p class="shrink-0 py-2 text-sm text-destructive">{state().error}</p>
              </Show>

              <Show
                when={d().tracks.length > 0}
                fallback={
                  <Show when={!state().detailLoading}>
                    <p class="py-12 text-center text-sm text-muted-foreground">歌单暂无歌曲</p>
                  </Show>
                }
              >
                <MusicOnlineTrackList
                  class="min-h-0 flex-1"
                  listInnerClass="px-0"
                  tracks={() => d().tracks}
                  origin="list"
                  onPlay={(tracks, index) =>
                    void playAsTemp(tracks, index, {
                      listName: d().info.name,
                      listKind: 'online-playlist',
                    })
                  }
                  contentRevision={() => `${d().info.id}:${d().tracks.length}`}
                />
              </Show>
            </div>
          </MusicHubPageShell>

          <BookCoverPreviewDialog
            open={coverPreviewOpen()}
            onOpenChange={setCoverPreviewOpen}
            coverUrl={d().info.coverUrl}
            bookUrl={d().info.coverUrl ?? ''}
            name={d().info.name}
          />
        </>
      )}
    </Show>
  );
};
