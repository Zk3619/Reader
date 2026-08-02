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
import { MusicSearchPane } from '@/components/media/viewer/audio/music/hub/MusicSearchPane';
import { MusicRecommendPane } from '@/components/media/viewer/audio/music/hub/MusicRecommendPane';
import { MusicSongListPane } from '@/components/media/viewer/audio/music/hub/MusicSongListPane';
import { MusicLeaderboardPane } from '@/components/media/viewer/audio/music/hub/MusicLeaderboardPane';
import { MusicSingerListPane } from '@/components/media/viewer/audio/music/hub/MusicSingerListPane';
import { MusicAlbumListPane } from '@/components/media/viewer/audio/music/hub/MusicAlbumListPane';
import { MusicBrowseDetail } from '@/components/media/viewer/audio/music/hub/MusicBrowseDetail';
import { MusicPlayDetail } from '@/components/media/viewer/audio/music/hub/MusicPlayDetail';
import { MusicSettingsPanel } from '@/components/media/viewer/audio/music/settings/MusicSettingsPanel';
import { AudioLocalScanDialog } from '@/components/media/viewer/audio/music/AudioLocalScanDialog';
import { MusicHubListPane } from '@/components/media/viewer/audio/music/hub/MusicHubListPane';
import { AudioDownloadPanel } from '@/components/media/viewer/audio/music/AudioDownloadPanel';
import { type useMusicHubPlayer } from '@/components/media/viewer/audio/music/hub/useMusicHubPlayer';
import { cn } from '@/lib/utils';
import { getMusicSettings } from '@/lib/media/audio/music-settings';
import { syncAllBoundLists } from '@/lib/media/audio/list/sync-source-list';
import {
  closeMusicBrowse,
  getMusicBrowseState,
} from '@/stores/music-hub/browse';

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
    if (getMusicSettings().syncAutoUpdateLists) {
      void syncAllBoundLists();
    }
  });

  const section = () => viewerStore.state.musicSection;
  const isActive = (name: MusicHubSection) => section() === name;
  const browse = getMusicBrowseState();
  const browseOpen = () => browse.open;

  // 侧栏/其它导航切换分区时收起详情叠层，避免盖在新页面上
  createEffect<MusicHubSection | undefined>((prev) => {
    const cur = section();
    if (prev !== undefined && prev !== cur && browseOpen()) {
      closeMusicBrowse();
    }
    return cur;
  });

  return (
    <div class="page-container relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <MusicHubSection section="recommend" active={isActive('recommend')}>
        <MusicRecommendPane />
      </MusicHubSection>
      <MusicHubSection section="search" active={isActive('search')}>
        <MusicSearchPane />
      </MusicHubSection>
      <MusicHubSection section="songlist" active={isActive('songlist')}>
        <MusicSongListPane />
      </MusicHubSection>
      <MusicHubSection section="leaderboard" active={isActive('leaderboard')}>
        <MusicLeaderboardPane />
      </MusicHubSection>
      <MusicHubSection section="artist" active={isActive('artist')}>
        <MusicSingerListPane />
      </MusicHubSection>
      <MusicHubSection section="album" active={isActive('album')}>
        <MusicAlbumListPane />
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
        <AudioDownloadPanel open inline hideHeader />
      </MusicHubSection>
      <MusicHubSection section="settings" active={isActive('settings')}>
        <MusicSettingsPanel />
      </MusicHubSection>
      <MusicHubSection section="nowPlaying" active={isActive('nowPlaying')}>
        <MusicPlayDetail player={props.player} />
      </MusicHubSection>

      <Show when={browseOpen()}>
        <div class="absolute inset-0 z-20 flex min-h-0 min-w-0 flex-col overflow-hidden bg-background">
          <MusicBrowseDetail />
        </div>
      </Show>

      <AudioLocalScanDialog
        open={scanOpen()}
        onOpenChange={setScanOpen}
        onImported={(tracks) => {
          invalidateLocalMusicSearchCache();
          setScanRevision((n) => n + 1);
          if (tracks.length > 0) {
            void import('@/stores/viewer/media/audio').then(({ playAsTemp }) =>
              playAsTemp(tracks, 0, {
                listName: '本地导入',
                listKind: 'temporary',
              }),
            );
          }
        }}
      />
    </div>
  );
};
