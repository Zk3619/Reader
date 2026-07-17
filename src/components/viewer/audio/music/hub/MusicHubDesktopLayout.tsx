/**
 * 桌面布局：Aside | Content | PlayBar
 * 播放详情页使用专属控制区，隐藏全局播放栏。
 */

import { type Component, Show } from 'solid-js';
import { MusicHubAsideNav } from '@/components/viewer/audio/music/hub/MusicHubAsideNav';
import { MusicHubContent } from '@/components/viewer/audio/music/hub/MusicHubContent';
import { MusicHubPlayBar } from '@/components/viewer/audio/music/hub/MusicHubPlayBar';
import type { useMusicHubPlayer } from '@/components/viewer/audio/music/hub/useMusicHubPlayer';
import { viewerStore } from '@/stores/viewer';

export interface MusicHubDesktopLayoutProps {
  player: ReturnType<typeof useMusicHubPlayer>;
  hideAside?: boolean;
}

export const MusicHubDesktopLayout: Component<MusicHubDesktopLayoutProps> = (props) => {
  const showGlobalPlayBar = () => viewerStore.state.musicSection !== 'nowPlaying';

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="flex min-h-0 flex-1 overflow-hidden">
        <Show when={!props.hideAside && showGlobalPlayBar()}>
          <MusicHubAsideNav />
        </Show>
        <MusicHubContent player={props.player} />
      </div>
      <Show when={showGlobalPlayBar()}>
        <MusicHubPlayBar player={props.player} />
      </Show>
    </div>
  );
};
