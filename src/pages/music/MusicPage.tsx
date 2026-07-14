/**
 * 音乐模块壳页
 * 对齐 lx-music：首屏非音乐时不挂载 Hub，避免预拉热搜等网络请求；首次进入后 keep-alive
 */

import { Show, createEffect, createSignal, type Accessor } from 'solid-js';
import { MusicHubShell } from '@/components/viewer/audio/music/hub/MusicHubShell';
import { readShellPageActive } from '@/lib/ui/shell-page-active';
import { cn } from '@/lib/utils';
import { mainShellPageRoot } from '@/lib/ui/viewport-classes';

export interface MusicPageProps {
  active?: boolean | Accessor<boolean>;
}

export function MusicPage(props: MusicPageProps) {
  const isActive = () => readShellPageActive(props.active);
  const [hubReady, setHubReady] = createSignal(false);

  createEffect(() => {
    if (isActive()) setHubReady(true);
  });

  return (
    <div class={cn(mainShellPageRoot, 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
      <Show when={hubReady()}>
        <MusicHubShell active={isActive} />
      </Show>
    </div>
  );
}
