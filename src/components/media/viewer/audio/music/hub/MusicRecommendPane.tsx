/**
 * Hub 推荐页：统一四区（热搜 / 推荐歌曲 / 推荐歌单 / 排行榜精选），无数据的区块隐藏
 * netease 对齐 Neri Home：热力飙升→热搜、私人雷达→推荐歌曲、为你推荐→推荐歌单
 */

import { For, Show, createEffect, createMemo, createSignal, type Component } from 'solid-js';
import { RefreshCw, Sparkles, Trophy } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import {
  AppSelect,
  AppSelectIcon,
  AppSelectItem,
  AppSelectListbox,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/shared/AppSelect';
import { ViewerAppSelectContent } from '@/components/media/viewer/viewer-app-overlay';
import { MusicHubPageShell } from '@/components/media/viewer/audio/music/hub/MusicHubPageShell';
import { MusicHubQuickScroll } from '@/components/media/viewer/audio/music/hub/MusicHubQuickScroll';
import { MusicPlaylistListCard } from '@/components/media/viewer/audio/music/hub/MusicPlaylistListCard';
import { MusicCoverImg } from '@/components/media/viewer/audio/music/MusicCoverImg';
import { musicHubPageContentInsetClass } from '@/lib/media/audio/music-hub-section-meta';
import {
  ensureMusicRecommendLoaded,
  getMusicRecommendState,
  listMusicRecommendSources,
  loadMusicRecommend,
  setMusicRecommendSource,
} from '@/stores/music-hub/recommend';
import {
  hubBrowseSourceLabel,
  type HubBrowseSource,
} from '@/lib/media/audio/online/mf-plugin/hub-browse-sources';
import {
  getSongListState,
  setSongListSource,
  openSongListDetail,
} from '@/stores/music-hub/songList';
import {
  getLeaderboardState,
  setLeaderboardSource,
  selectLeaderboardBoard,
} from '@/stores/music-hub/leaderboard';
import { searchByKeyword } from '@/stores/music-hub/search';
import { playAsTemp, setMusicSection } from '@/stores/viewer/media/audio';
import type { LeaderboardBoard, OnlinePlaylistSummary } from '@/lib/media/audio/music-sdk/types';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { cn } from '@/lib/utils';

function RecommendSectionHeader(props: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div class="mb-2 flex items-center justify-between gap-2">
      <h2 class="text-sm font-semibold text-foreground">{props.title}</h2>
      <Show when={props.actionLabel && props.onAction}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-7 px-2 text-xs text-muted-foreground"
          onClick={props.onAction}
        >
          {props.actionLabel}
        </Button>
      </Show>
    </div>
  );
}

function HotKeywordChips(props: {
  keywords: string[];
  onPick: (word: string) => void;
}) {
  return (
    <div class="flex flex-wrap gap-2">
      <For each={props.keywords}>
        {(word) => (
          <button
            type="button"
            class="rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs text-foreground transition-colors hover:bg-muted hover:text-primary"
            onClick={() => props.onPick(word)}
          >
            {word}
          </button>
        )}
      </For>
    </div>
  );
}

function RecommendTrackScroller(props: {
  tracks: AudioTrack[];
  onPlay: (tracks: AudioTrack[], index: number) => void;
}) {
  return (
    <ul class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      <For each={props.tracks}>
        {(track, index) => (
          <li class="w-36 shrink-0 list-none sm:w-40">
            <button
              type="button"
              class="flex w-full flex-col gap-1.5 rounded-xl border border-border/50 bg-card/30 p-2 text-left transition-colors hover:bg-muted/50"
              onClick={() => props.onPlay(props.tracks, index())}
            >
              <div class="aspect-square w-full overflow-hidden rounded-lg bg-muted/40">
                <Show
                  when={String(track.meta?.coverUrl ?? '')}
                  fallback={
                    <div class="flex h-full w-full items-center justify-center text-muted-foreground">
                      <Sparkles class="h-6 w-6 opacity-30" />
                    </div>
                  }
                >
                  {(src) => (
                    <MusicCoverImg
                      src={src()}
                      alt=""
                      class="h-full w-full object-cover"
                      loading="lazy"
                      draggable={false}
                    />
                  )}
                </Show>
              </div>
              <span class="line-clamp-2 text-xs font-medium leading-snug text-foreground">
                {track.name}
              </span>
              <span class="truncate text-[11px] text-muted-foreground">{track.artist}</span>
            </button>
          </li>
        )}
      </For>
    </ul>
  );
}

function RecommendPlaylistGrid(props: {
  playlists: OnlinePlaylistSummary[];
  onOpen: (pl: OnlinePlaylistSummary) => void;
}) {
  return (
    <ul class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      <For each={props.playlists}>
        {(pl) => (
          <li class="min-w-0 list-none">
            <MusicPlaylistListCard
              playlist={pl}
              variant="grid"
              showSource={false}
              onOpen={() => props.onOpen(pl)}
              class="h-full w-full"
            />
          </li>
        )}
      </For>
    </ul>
  );
}

function RecommendBoardGrid(props: {
  boards: LeaderboardBoard[];
  onOpen: (board: LeaderboardBoard) => void;
}) {
  return (
    <ul class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <For each={props.boards}>
        {(board) => (
          <li class="min-w-0 list-none">
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
              onClick={() => props.onOpen(board)}
            >
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Trophy class="h-4 w-4" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-foreground">
                  {board.name}
                </span>
                <Show when={board.group}>
                  <span class="block truncate text-xs text-muted-foreground">
                    {board.group}
                  </span>
                </Show>
              </span>
            </button>
          </li>
        )}
      </For>
    </ul>
  );
}

export const MusicRecommendPane: Component = () => {
  const state = getMusicRecommendState;
  const [scrollEl, setScrollEl] = createSignal<HTMLDivElement | undefined>();
  const sources = createMemo(() => listMusicRecommendSources());

  createEffect(() => {
    void ensureMusicRecommendLoaded();
  });

  const openHotKeyword = (word: string) => {
    setMusicSection('search');
    void searchByKeyword(word);
  };

  const openPlaylist = (pl: OnlinePlaylistSummary) => {
    if (getSongListState().source !== pl.source) {
      setSongListSource(pl.source);
    }
    setMusicSection('songlist');
    void openSongListDetail(pl.id, 1, pl);
  };

  const openBoard = (board: LeaderboardBoard) => {
    if (getLeaderboardState().source !== board.source) {
      setLeaderboardSource(board.source);
    }
    setMusicSection('leaderboard');
    void selectLeaderboardBoard(board, 1);
  };

  const playTracks = (tracks: AudioTrack[], index: number, listName: string) => {
    void playAsTemp(tracks, index, { listName, listKind: 'temporary' });
  };

  const goSongList = () => {
    const src = state().source;
    if ((src === 'netease' || src === 'ytm') && getSongListState().source !== src) {
      setSongListSource(src);
    }
    setMusicSection('songlist');
  };
  const goLeaderboard = () => setMusicSection('leaderboard');

  const showHotSection = () =>
    state().hotKeywords.length > 0 || state().hotTracks.length > 0;

  const hasContent = () =>
    showHotSection() ||
    state().recommendTracks.length > 0 ||
    state().playlists.length > 0 ||
    state().boards.length > 0;

  return (
    <MusicHubPageShell
      section="recommend"
      scrollClass="overflow-hidden"
      toolbar={
        <>
          <AppSelect
            value={state().source}
            onChange={(value) => {
              if (value != null) setMusicRecommendSource(value as HubBrowseSource);
            }}
            options={sources()}
            itemComponent={(itemProps) => (
              <AppSelectItem item={itemProps.item}>
                {hubBrowseSourceLabel(itemProps.item.rawValue as HubBrowseSource)}
              </AppSelectItem>
            )}
          >
            <AppSelectTrigger layout="compact" class="h-9 w-22 sm:w-24" aria-label="推荐来源">
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
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="h-9 w-9"
            aria-label="刷新推荐"
            disabled={state().loading}
            onClick={() => void loadMusicRecommend({ force: true })}
          >
            <RefreshCw class={cn('h-4 w-4', state().loading && 'animate-spin')} />
          </Button>
        </>
      }
    >
      <div
        ref={setScrollEl}
        class={cn(
          'relative min-h-0 flex-1 overflow-y-auto py-3',
          musicHubPageContentInsetClass,
        )}
      >
        <Show when={state().loading && !hasContent()}>
          <div class="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <Sparkles class="h-8 w-8 opacity-40" />
            <p class="text-sm">加载推荐内容…</p>
          </div>
        </Show>

        <Show when={showHotSection()}>
          <section class="mb-6">
            <RecommendSectionHeader title="热搜" />
            <Show
              when={state().hotKeywords.length > 0}
              fallback={
                <RecommendTrackScroller
                  tracks={state().hotTracks}
                  onPlay={(tracks, index) => playTracks(tracks, index, '热力飙升')}
                />
              }
            >
              <HotKeywordChips keywords={state().hotKeywords} onPick={openHotKeyword} />
            </Show>
          </section>
        </Show>

        <Show when={state().recommendTracks.length > 0}>
          <section class="mb-6">
            <RecommendSectionHeader title="推荐歌曲" />
            <RecommendTrackScroller
              tracks={state().recommendTracks}
              onPlay={(tracks, index) => playTracks(tracks, index, '推荐歌曲')}
            />
          </section>
        </Show>

        <Show when={state().playlists.length > 0}>
          <section class="mb-6">
            <RecommendSectionHeader
              title="推荐歌单"
              actionLabel="全部歌单"
              onAction={goSongList}
            />
            <RecommendPlaylistGrid playlists={state().playlists} onOpen={openPlaylist} />
          </section>
        </Show>

        <Show when={state().boards.length > 0}>
          <section class="mb-6">
            <RecommendSectionHeader
              title="排行榜精选"
              actionLabel="全部榜单"
              onAction={goLeaderboard}
            />
            <RecommendBoardGrid boards={state().boards} onOpen={openBoard} />
          </section>
        </Show>

        <Show when={!state().loading && !state().error && !hasContent()}>
          <p class="py-16 text-center text-sm text-muted-foreground">
            当前来源暂无推荐内容，可切换其它音源试试
          </p>
        </Show>
      </div>
      <MusicHubQuickScroll
        container={scrollEl}
        contentRevision={() =>
          `${state().source}:${state().hotKeywords.length}:${state().hotTracks.length}:${state().recommendTracks.length}:${state().playlists.length}:${state().boards.length}`
        }
      />
    </MusicHubPageShell>
  );
};
