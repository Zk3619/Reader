/**
 * 音乐模块壳页
 * 对齐 lx-music：首屏非音乐时不挂载 Hub，避免预拉热搜等网络请求；首次进入后 keep-alive。
 * 会话由 DB ready → hydrateDeferred 恢复；进入时仅 openMusicHub 设 playbackMode，不再阻塞挂载。
 */

import { Show, createEffect, createSignal, type Accessor } from 'solid-js';
import { MusicHubShell } from '@/components/viewer/audio/music/hub/MusicHubShell';
import { readShellPageActive } from '@/lib/ui/shell-page-active';
import { cn } from '@/lib/utils';
import { mainShellPageRoot } from '@/lib/ui/viewport-classes';
import { ThemeTargetHost } from '@/components/theme/ThemeTargetHost';
import { viewerStore } from '@/stores/viewer';

export interface MusicPageProps {
  active?: boolean | Accessor<boolean>;
}

export function MusicPage(props: MusicPageProps) {
  const isActive = () => readShellPageActive(props.active);
  const [hubMounted, setHubMounted] = createSignal(false);

  createEffect(() => {
    if (!isActive()) return;
    setHubMounted(true);
    void viewerStore.openMusicHub();
  });

  return (
    <ThemeTargetHost
      target="module.music"
      class={cn(mainShellPageRoot, 'flex min-h-0 flex-1 flex-col overflow-hidden')}
    >
      <Show when={hubMounted()}>
        <MusicHubShell active={isActive} />
      </Show>
    </ThemeTargetHost>
  );
}
