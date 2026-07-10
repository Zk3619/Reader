/**
 * 音乐 Hub 主内容区（按 section 切换）
 */

import { createSignal, Match, Switch, type Component } from 'solid-js';
import { viewerStore } from '@/stores/viewer';
import { MusicSearchPane } from '@/components/viewer/audio/music/hub/MusicSearchPane';
import { MusicSongListPane } from '@/components/viewer/audio/music/hub/MusicSongListPane';
import { MusicLeaderboardPane } from '@/components/viewer/audio/music/hub/MusicLeaderboardPane';
import { MusicAlbumPane } from '@/components/viewer/audio/music/hub/MusicAlbumPane';
import { MusicSingerPane } from '@/components/viewer/audio/music/hub/MusicSingerPane';
import { UserApiBrowsePane } from '@/components/viewer/audio/music/hub/UserApiBrowsePane';
import { MusicPlayDetail } from '@/components/viewer/audio/music/hub/MusicPlayDetail';
import { AudioDownloadPanel } from '@/components/viewer/audio/music/AudioDownloadPanel';
import { MusicSettingsPanel } from '@/components/viewer/audio/music/settings/MusicSettingsPanel';
import { AudioLocalScanDialog } from '@/components/viewer/audio/music/AudioLocalScanDialog';
import { MusicHubListPane } from '@/components/viewer/audio/music/hub/MusicHubListPane';
import { type useMusicHubPlayer } from '@/components/viewer/audio/music/hub/useMusicHubPlayer';

export interface MusicHubContentProps {
  player: ReturnType<typeof useMusicHubPlayer>;
  listDrawerOpen?: boolean;
  onListDrawerToggle?: () => void;
}

export const MusicHubContent: Component<MusicHubContentProps> = (props) => {
  const [scanOpen, setScanOpen] = createSignal(false);

  const section = () => viewerStore.state.musicSection;

  return (
    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <Switch>
        <Match when={section() === 'search'}>
          <MusicSearchPane />
        </Match>
        <Match when={section() === 'songlist'}>
          <MusicSongListPane />
        </Match>
        <Match when={section() === 'leaderboard'}>
          <MusicLeaderboardPane />
        </Match>
        <Match when={section() === 'album'}>
          <MusicAlbumPane />
        </Match>
        <Match when={section() === 'singer'}>
          <MusicSingerPane />
        </Match>
        <Match when={section() === 'userApi'}>
          <UserApiBrowsePane />
        </Match>
        <Match when={section() === 'list'}>
          <MusicHubListPane
            drawerOpen={props.listDrawerOpen}
            onDrawerOpen={props.onListDrawerToggle}
            onScanLocal={() => setScanOpen(true)}
          />
        </Match>
        <Match when={section() === 'download'}>
          <AudioDownloadPanel open inline />
        </Match>
        <Match when={section() === 'settings'}>
          <MusicSettingsPanel />
        </Match>
        <Match when={section() === 'nowPlaying'}>
          <MusicPlayDetail player={props.player} />
        </Match>
      </Switch>

      <AudioLocalScanDialog
        open={scanOpen()}
        onOpenChange={setScanOpen}
        onImported={(tracks) => {
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
