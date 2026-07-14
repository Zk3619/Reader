/**
 * 音乐 Hub 主内容区
 * 对齐 lx-music router：仅当前 section 首次进入时挂载；之后 keep-alive 避免闪烁
 */

import {
  Show,
  createEffect,
  createSignal,
  onMount,
  type Component,
  type JSX,
} from 'solid-js';
import { viewerStore } from '@/stores/viewer';
import type { MusicHubSection } from '@/stores/viewer/base-state';
import { ensureLocalMusicSearchCache, invalidateLocalMusicSearchCache } from '@/lib/media/audio/music-local-search';
import { MusicSearchPane } from '@/components/viewer/audio/music/hub/MusicSearchPane';
import { MusicSongListPane } from '@/components/viewer/audio/music/hub/MusicSongListPane';
import { MusicLeaderboardPane } from '@/components/viewer/audio/music/hub/MusicLeaderboardPane';
import { MusicAlbumPane } from '@/components/viewer/audio/music/hub/MusicAlbumPane';
import { MusicSingerPane } from '@/components/viewer/audio/music/hub/MusicSingerPane';
import { UserApiBrowsePane } from '@/components/viewer/audio/music/hub/UserApiBrowsePane';
import { MusicPlayDetail } from '@/components/viewer/audio/music/hub/MusicPlayDetail';
import { AudioDownloadPanel } from '@/components/viewer/audio/music/AudioDownloadPanel';
import { MusicSettingsPanel } from '@/components/viewer/audio/music/settings/MusicSettingsPanel';
import { MusicHubPageShell } from '@/components/viewer/audio/music/hub/MusicHubPageShell';
import { AudioLocalScanDialog } from '@/components/viewer/audio/music/AudioLocalScanDialog';
import { MusicHubListPane } from '@/components/viewer/audio/music/hub/MusicHubListPane';
import { type useMusicHubPlayer } from '@/components/viewer/audio/music/hub/useMusicHubPlayer';
import { cn } from '@/lib/utils';

export interface MusicHubContentProps {
  player: ReturnType<typeof useMusicHubPlayer>;
  listDrawerOpen?: boolean;
  onListDrawerToggle?: () => void;
}

/** 首次 active 才挂载子页；之后仅 hidden，避免预拉各源网络 */
function MusicHubSection(props: {
  section: MusicHubSection;
  active: boolean;
  children: JSX.Element;
}) {
  const [visited, setVisited] = createSignal(props.active);

  createEffect(() => {
    if (props.active) setVisited(true);
  });

  return (
    <Show when={visited()}>
      <div
        class={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
          !props.active && 'hidden',
        )}
        aria-hidden={!props.active}
        data-music-hub-section={props.section}
      >
        {props.children}
      </div>
    </Show>
  );
}

export const MusicHubContent: Component<MusicHubContentProps> = (props) => {
  const [scanOpen, setScanOpen] = createSignal(false);
  const [scanRevision, setScanRevision] = createSignal(0);

  onMount(() => {
    void ensureLocalMusicSearchCache();
  });

  const section = () => viewerStore.state.musicSection;
  const isActive = (name: MusicHubSection) => section() === name;

  return (
    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <MusicHubSection section="search" active={isActive('search')}>
        <MusicSearchPane />
      </MusicHubSection>
      <MusicHubSection section="songlist" active={isActive('songlist')}>
        <MusicSongListPane />
      </MusicHubSection>
      <MusicHubSection section="leaderboard" active={isActive('leaderboard')}>
        <MusicLeaderboardPane />
      </MusicHubSection>
      <MusicHubSection section="album" active={isActive('album')}>
        <MusicAlbumPane />
      </MusicHubSection>
      <MusicHubSection section="singer" active={isActive('singer')}>
        <MusicSingerPane />
      </MusicHubSection>
      <MusicHubSection section="userApi" active={isActive('userApi')}>
        <UserApiBrowsePane />
      </MusicHubSection>
      <MusicHubSection section="list" active={isActive('list')}>
        <MusicHubListPane
          drawerOpen={props.listDrawerOpen}
          onDrawerOpen={props.onListDrawerToggle}
          onScanLocal={() => setScanOpen(true)}
          scanRevision={scanRevision()}
        />
      </MusicHubSection>
      <MusicHubSection section="download" active={isActive('download')}>
        <MusicHubPageShell section="download" scrollClass="overflow-hidden">
          <AudioDownloadPanel open inline hideHeader />
        </MusicHubPageShell>
      </MusicHubSection>
      <MusicHubSection section="settings" active={isActive('settings')}>
        <MusicHubPageShell section="settings" scrollClass="overflow-hidden">
          <MusicSettingsPanel />
        </MusicHubPageShell>
      </MusicHubSection>
      <MusicHubSection section="nowPlaying" active={isActive('nowPlaying')}>
        <MusicPlayDetail player={props.player} />
      </MusicHubSection>

      <AudioLocalScanDialog
        open={scanOpen()}
        onOpenChange={setScanOpen}
        onImported={(tracks) => {
          invalidateLocalMusicSearchCache();
          setScanRevision((n) => n + 1);
          if (tracks.length > 0) {
            void import('@/stores/viewer/media/audio').then(({ playPlaylist }) =>
              playPlaylist(tracks, 0),
            );
          }
        }}
      />
    </div>
  );
};
