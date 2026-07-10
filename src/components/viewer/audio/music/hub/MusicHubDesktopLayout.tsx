/**
 * 桌面布局：Aside | Content | PlayBar
 */

import { type Component, Show } from 'solid-js';
import { MusicHubAsideNav } from '@/components/viewer/audio/music/hub/MusicHubAsideNav';
import { MusicHubContent } from '@/components/viewer/audio/music/hub/MusicHubContent';
import { MusicHubPlayBar } from '@/components/viewer/audio/music/hub/MusicHubPlayBar';
import type { useMusicHubPlayer } from '@/components/viewer/audio/music/hub/useMusicHubPlayer';

export interface MusicHubDesktopLayoutProps {
  player: ReturnType<typeof useMusicHubPlayer>;
  hideAside?: boolean;
}

export const MusicHubDesktopLayout: Component<MusicHubDesktopLayoutProps> = (props) => {
  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="flex min-h-0 flex-1 overflow-hidden">
        <Show when={!props.hideAside}>
          <MusicHubAsideNav />
        </Show>
        <MusicHubContent player={props.player} />
      </div>
      <MusicHubPlayBar player={props.player} />
    </div>
  );
};
