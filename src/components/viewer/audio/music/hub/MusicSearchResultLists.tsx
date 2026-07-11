/**
 * 音乐搜索结果列表：歌曲 / 歌单（桌面与移动分别对齐 lx-music）
 * 在线结果使用 VirtualList，对齐阅读模块虚拟滚动。
 */

import { For, Show, type Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { VirtualList } from '@/components/shared/virtual-list';
import { useShellLayout } from '@/components/shell/ShellLayoutProvider';
import { MusicPlaylistVirtualList } from '@/components/viewer/audio/music/hub/MusicPlaylistVirtualList';
import { AGGREGATE_SEARCH_SOURCE } from '@/lib/media/audio/online/source-router';
import type { SearchSource } from '@/lib/media/audio/online/source-router';
import type { OnlinePlaylistSummary } from '@/lib/media/audio/music-sdk/types';
import {
  trackAlbumName,
  trackQualityBadge,
  trackSourceBadgeLabel,
} from '@/lib/media/audio/music-search-result-ui';
import type { AudioTrack } from '@/lib/media/audio/track-types';
import { cn } from '@/lib/utils';

const DESKTOP_TRACK_ROW_HEIGHT_PX = 44;
const MOBILE_TRACK_ROW_HEIGHT_PX = 54;
/** 本地分组内歌曲超过该阈值时启用组内虚拟列表 */
const LOCAL_GROUP_VIRTUALIZE_THRESHOLD = 30;
const LOCAL_GROUP_LIST_MAX_HEIGHT_PX = 360;

function trackRowHeightPx(mobile: boolean) {
  return mobile ? MOBILE_TRACK_ROW_HEIGHT_PX : DESKTOP_TRACK_ROW_HEIGHT_PX;
}

function trackItemKey(track: AudioTrack, index: number) {
  return `${track.source}|${track.id}|${index}`;
}

function TrackBadges(props: {
  track: AudioTrack;
  showSource: boolean;
  mobile?: boolean;
}) {
  const quality = () => trackQualityBadge(props.track);
  return (
    <>
      <Show when={quality()}>
        {(badge) => (
          <Badge
            variant={props.mobile && badge().variant === 'default' ? 'secondary' : badge().variant}
            class="shrink-0 px-1 py-0 text-[10px] font-normal leading-4"
          >
            {badge().label}
          </Badge>
        )}
      </Show>
      <Show when={props.showSource}>
        <Badge variant="outline" class="shrink-0 px-1 py-0 text-[10px] font-normal leading-4">
          {trackSourceBadgeLabel(props.track)}
        </Badge>
      </Show>
    </>
  );
}

function DesktopTrackHeaderRow() {
  return (
    <div class="flex items-center px-2 py-2 text-xs font-medium text-muted-foreground">
      <span class="w-[5%] shrink-0 text-center">#</span>
      <span class="min-w-0 flex-1 px-1">歌曲名</span>
      <span class="w-[24%] shrink-0 truncate px-1">艺术家</span>
      <span class="w-[27%] shrink-0 truncate px-1">专辑名</span>
      <span class="w-[10%] shrink-0 text-right px-1">时长</span>
    </div>
  );
}

function DesktopTrackHeader() {
  return (
    <div class="sticky top-0 z-10 shrink-0 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <DesktopTrackHeaderRow />
    </div>
  );
}

function DesktopTrackRow(props: {
  track: AudioTrack;
  index: number;
  showSource: boolean;
  onPlay: () => void;
}) {
  return (
    <div class="h-full border-b border-border/40">
      <Button
        type="button"
        variant="ghost"
        class="h-full w-full items-center rounded-none px-2 py-2.5 text-left text-xs font-normal hover:bg-muted/50 sm:text-sm"
        onClick={props.onPlay}
      >
        <span class="flex w-full items-center">
          <span class="w-[5%] shrink-0 text-center tabular-nums text-muted-foreground">
            {props.index + 1}
          </span>
          <span class="flex min-w-0 flex-1 items-center gap-1.5 px-1">
            <span class="min-w-0 truncate">{props.track.name}</span>
            <TrackBadges track={props.track} showSource={props.showSource} />
          </span>
          <span class="w-[24%] shrink-0 truncate px-1 text-muted-foreground">{props.track.artist}</span>
          <span class="w-[27%] shrink-0 truncate px-1 text-muted-foreground">
            {trackAlbumName(props.track)}
          </span>
          <span class="w-[10%] shrink-0 text-right px-1 tabular-nums text-muted-foreground">
            {props.track.duration || '--:--'}
          </span>
        </span>
      </Button>
    </div>
  );
}

function MobileTrackRow(props: {
  track: AudioTrack;
  index: number;
  showSource: boolean;
  onPlay: () => void;
}) {
  const album = () => trackAlbumName(props.track);
  const subtitle = () => {
    const artist = props.track.artist?.trim();
    const albumName = album().trim();
    if (artist && albumName) return `${artist} · ${albumName}`;
    return artist || albumName || '';
  };

  return (
    <div class="h-full border-b border-border/40">
      <Button
        type="button"
        variant="ghost"
        class="h-full min-h-[54px] w-full justify-start gap-2 rounded-none px-3 py-0 font-normal hover:bg-muted/50"
        onClick={props.onPlay}
      >
        <span class="w-9 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
          {props.index + 1}
        </span>
        <span class="min-w-0 flex-1 overflow-hidden text-left">
          <span class="flex min-w-0 items-center gap-1">
            <span class="min-w-0 truncate text-sm">{props.track.name}</span>
            <TrackBadges track={props.track} showSource={props.showSource} mobile />
          </span>
          <Show when={subtitle()}>
            <p class="truncate text-xs text-muted-foreground">{subtitle()}</p>
          </Show>
        </span>
        <span class="shrink-0 text-xs tabular-nums text-muted-foreground">
          {props.track.duration || '--:--'}
        </span>
      </Button>
    </div>
  );
}

function TrackListRows(props: {
  tracks: AudioTrack[];
  showSource: boolean;
  mobile: boolean;
  onPlay: (tracks: AudioTrack[], index: number) => void;
}) {
  return (
    <For each={props.tracks}>
      {(track, index) => (
        <Show
          when={props.mobile}
          fallback={
            <DesktopTrackRow
              track={track}
              index={index()}
              showSource={props.showSource}
              onPlay={() => props.onPlay(props.tracks, index())}
            />
          }
        >
          <MobileTrackRow
            track={track}
            index={index()}
            showSource={props.showSource}
            onPlay={() => props.onPlay(props.tracks, index())}
          />
        </Show>
      )}
    </For>
  );
}

export interface MusicSearchTrackListProps {
  tracks: AudioTrack[];
  source: SearchSource;
  onPlay: (tracks: AudioTrack[], index: number) => void;
  class?: string;
}

export const MusicSearchTrackList: Component<MusicSearchTrackListProps> = (props) => {
  const shell = useShellLayout();
  const isMobileLayout = () => shell().useMobileShell;
  const showSource = () => props.source === AGGREGATE_SEARCH_SOURCE;
  const items = () => props.tracks;
  const remeasureLayout = () => `${isMobileLayout()}|${shell().windowWidth}`;

  return (
    <div class={cn('flex min-h-0 flex-1 flex-col', props.class)}>
      <Show when={!isMobileLayout()}>
        <DesktopTrackHeader />
      </Show>
      <VirtualList<AudioTrack>
        class="min-h-0 flex-1"
        items={items}
        estimateSize={() => trackRowHeightPx(isMobileLayout())}
        remeasureWhen={remeasureLayout}
        overscan={8}
        getItemKey={trackItemKey}
      >
        {(track, index) => (
          <Show
            when={isMobileLayout()}
            fallback={
              <DesktopTrackRow
                track={track}
                index={index}
                showSource={showSource()}
                onPlay={() => props.onPlay(props.tracks, index)}
              />
            }
          >
            <MobileTrackRow
              track={track}
              index={index}
              showSource={showSource()}
              onPlay={() => props.onPlay(props.tracks, index)}
            />
          </Show>
        )}
      </VirtualList>
    </div>
  );
};

/** @deprecated 使用 MusicSearchTrackList */
export const MusicSearchOnlineList = MusicSearchTrackList;

export interface MusicSearchPlaylistListProps {
  playlists: OnlinePlaylistSummary[];
  source: SearchSource;
  onOpen: (playlist: OnlinePlaylistSummary) => void;
  class?: string;
}

export const MusicSearchPlaylistList: Component<MusicSearchPlaylistListProps> = (props) => {
  const showSource = () => props.source === AGGREGATE_SEARCH_SOURCE;

  return (
    <MusicPlaylistVirtualList
      class={props.class}
      listInnerClass="px-4 pb-4 pt-1"
      playlists={() => props.playlists}
      showSource={showSource()}
      onOpen={props.onOpen}
    />
  );
};

export interface MusicSearchLocalGroupListProps {
  groups: import('@/lib/media/audio/music-local-search').LocalMusicSearchGroup[];
  source?: SearchSource;
  onPlay: (tracks: AudioTrack[], index: number) => void;
  class?: string;
}

export const MusicSearchLocalGroupList: Component<MusicSearchLocalGroupListProps> = (props) => {
  const shell = useShellLayout();
  const isMobileLayout = () => shell().useMobileShell;
  const showSource = () => props.source === AGGREGATE_SEARCH_SOURCE;
  const rowHeight = () => trackRowHeightPx(isMobileLayout());
  const remeasureLayout = () => `${isMobileLayout()}|${shell().windowWidth}`;

  const groupListHeightPx = (trackCount: number) =>
    Math.min(trackCount * rowHeight(), LOCAL_GROUP_LIST_MAX_HEIGHT_PX);

  return (
    <div class={cn('space-y-4', props.class)}>
      <For each={props.groups}>
        {(group) => (
          <section>
            <h3 class="mb-2 text-xs font-medium text-muted-foreground">{group.groupName}</h3>
            <div class={cn('overflow-hidden', !isMobileLayout() && 'rounded-lg border')}>
              <Show when={!isMobileLayout()}>
                <div class="border-b bg-muted/30">
                  <DesktopTrackHeaderRow />
                </div>
              </Show>
              <Show
                when={group.tracks.length > LOCAL_GROUP_VIRTUALIZE_THRESHOLD}
                fallback={
                  <div class="divide-y">
                    <TrackListRows
                      tracks={group.tracks}
                      showSource={showSource()}
                      mobile={isMobileLayout()}
                      onPlay={props.onPlay}
                    />
                  </div>
                }
              >
                <div
                  class="min-h-0"
                  style={{ height: `${groupListHeightPx(group.tracks.length)}px` }}
                >
                  <VirtualList<AudioTrack>
                    class="h-full min-h-0"
                    items={() => group.tracks}
                    estimateSize={() => rowHeight()}
                    remeasureWhen={remeasureLayout}
                    overscan={6}
                    getItemKey={trackItemKey}
                  >
                    {(track, index) => (
                      <Show
                        when={isMobileLayout()}
                        fallback={
                          <DesktopTrackRow
                            track={track}
                            index={index}
                            showSource={showSource()}
                            onPlay={() => props.onPlay(group.tracks, index)}
                          />
                        }
                      >
                        <MobileTrackRow
                          track={track}
                          index={index}
                          showSource={showSource()}
                          onPlay={() => props.onPlay(group.tracks, index)}
                        />
                      </Show>
                    )}
                  </VirtualList>
                </div>
              </Show>
            </div>
          </section>
        )}
      </For>
    </div>
  );
};
