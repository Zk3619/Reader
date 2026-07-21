/**
 * 专辑 / 歌手浏览详情（Hub 全屏叠加）
 */

import { Show, createSignal, type Component } from 'solid-js';
import { Music2 } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { SettingsToolbarLeading } from '@/components/shell/SettingsPageToolbar';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { BookCoverPreviewDialog } from '@/components/media/reader/books/BookCoverPreviewDialog';
import { PlayIcon, PlusIcon } from '@/components/shared/icons';
import { playAsTemp } from '@/stores/viewer/media/audio';
import { addTracksToPlaylist } from '@/lib/database/audio-library';
import { BUILTIN_PLAYLIST_IDS } from '@/lib/media/audio/track-types';
import { musicHubPageContentInsetClass } from '@/lib/media/audio/music-hub-section-meta';
import { MusicHubPageShell } from '@/components/media/viewer/audio/music/hub/MusicHubPageShell';
import { MusicOnlineTrackList } from '@/components/media/viewer/audio/music/hub/MusicSearchResultLists';
import { MusicTrackListSkeleton } from '@/components/media/viewer/audio/music/hub/MusicHubSkeletons';
import { cn } from '@/lib/utils';
import { MusicCoverImg } from '@/components/media/viewer/audio/music/MusicCoverImg';
import {
  closeMusicBrowse,
  getMusicBrowseState,
  loadMoreMusicBrowse,
} from '@/stores/music-hub/browse';

export const MusicBrowseDetail: Component = () => {
  const state = getMusicBrowseState();
  const detail = () => state.detail;
  const [coverPreviewOpen, setCoverPreviewOpen] = createSignal(false);

  const title = () => {
    const d = detail();
    if (!d) return state.loading ? '加载中…' : '详情';
    return d.name;
  };

  const metaLine = () => {
    const d = detail();
    if (!d) return '';
    const kind = d.kind === 'album' ? '专辑' : '歌手';
    return [kind, d.subtitle, d.tracks.length ? `${d.tracks.length} 首` : '']
      .filter(Boolean)
      .join(' · ');
  };

  return (
    <div class="absolute inset-0 z-20 flex min-h-0 flex-col bg-background">
      <MusicHubPageShell
        section="search"
        title={title()}
        description={metaLine() || (detail()?.kind === 'album' ? '专辑详情' : '歌手详情')}
        leading={<SettingsToolbarLeading onBack={() => closeMusicBrowse()} />}
        scrollClass="overflow-hidden"
        toolbar={
          <Show when={detail()}>
            {(d) => (
              <>
                <AppTooltip>
                  <AppTooltipTrigger
                    as={Button}
                    variant="ghost"
                    size="icon"
                    class="h-9 w-9 shrink-0"
                    onClick={() =>
                      void playAsTemp(d().tracks, 0, {
                        listName: d().name,
                        listKind: 'temporary',
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
            )}
          </Show>
        }
      >
        <div
          class={cn(
            'flex min-h-0 flex-1 flex-col overflow-hidden',
            musicHubPageContentInsetClass,
          )}
        >
          <Show when={state.error}>
            <p class="py-8 text-center text-sm text-destructive">{state.error}</p>
          </Show>

          <Show when={detail()}>
            {(d) => (
              <>
                <div class="flex shrink-0 gap-3 border-b py-3">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={!d().coverUrl?.trim()}
                    onClick={() => {
                      if (d().coverUrl?.trim()) setCoverPreviewOpen(true);
                    }}
                    class={cn(
                      'relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted p-0 shadow-sm',
                      d().coverUrl?.trim() &&
                        'cursor-zoom-in transition-transform hover:scale-[1.02]',
                    )}
                    aria-label={d().coverUrl?.trim() ? '查看封面大图' : undefined}
                  >
                    <Show
                      when={d().coverUrl?.trim()}
                      fallback={
                        <div class="flex h-full w-full items-center justify-center text-muted-foreground">
                          <Music2 class="h-8 w-8 opacity-40" />
                        </div>
                      }
                    >
                      <MusicCoverImg
                        src={d().coverUrl}
                        alt={d().name}
                        class="h-full w-full object-cover"
                        loading="lazy"
                        draggable={false}
                      />
                    </Show>
                  </Button>
                  <div class="min-w-0 flex-1">
                    <Show when={d().subtitle?.trim()}>
                      <p class="truncate text-sm text-muted-foreground">{d().subtitle}</p>
                    </Show>
                    <Show
                      when={d().intro?.trim()}
                      fallback={
                        <p class="mt-1 text-xs text-muted-foreground/70">暂无简介</p>
                      }
                    >
                      <p class="mt-1 line-clamp-3 text-xs leading-snug text-muted-foreground">
                        {d().intro}
                      </p>
                    </Show>
                  </div>
                </div>

                <Show when={state.loading && d().tracks.length === 0}>
                  <MusicTrackListSkeleton class="min-h-0 flex-1 overflow-hidden" />
                </Show>

                <Show
                  when={d().tracks.length > 0}
                  fallback={
                    <Show when={!state.loading}>
                      <p class="py-12 text-center text-sm text-muted-foreground">暂无歌曲</p>
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
                        listName: d().name,
                        listKind: 'temporary',
                      })
                    }
                    contentRevision={() => `${d().kind}:${d().id}:${d().tracks.length}`}
                    scrollFooter={
                      <Show when={d().hasMore}>
                        <div class="flex justify-center py-3">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={state.loadingMore}
                            onClick={() => void loadMoreMusicBrowse()}
                          >
                            {state.loadingMore ? '加载中…' : '加载更多'}
                          </Button>
                        </div>
                      </Show>
                    }
                  />
                </Show>
              </>
            )}
          </Show>

          <Show when={state.loading && !detail()}>
            <MusicTrackListSkeleton class="min-h-0 flex-1 overflow-hidden" />
          </Show>
        </div>
      </MusicHubPageShell>

      <Show when={detail()?.coverUrl}>
        <BookCoverPreviewDialog
          open={coverPreviewOpen()}
          onOpenChange={setCoverPreviewOpen}
          coverUrl={detail()!.coverUrl}
          bookUrl={detail()!.coverUrl ?? ''}
          name={detail()!.name}
        />
      </Show>
    </div>
  );
};
