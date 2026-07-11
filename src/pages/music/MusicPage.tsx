/**
 * 音乐模块壳页
 */

import { type Accessor } from 'solid-js';
import { MusicHubShell } from '@/components/viewer/audio/music/hub/MusicHubShell';
import { readShellPageActive } from '@/lib/ui/shell-page-active';
import { cn } from '@/lib/utils';
import { mainShellPageRoot } from '@/lib/ui/viewport-classes';

export interface MusicPageProps {
  active?: boolean | Accessor<boolean>;
}

export function MusicPage(props: MusicPageProps) {
  const isActive = () => readShellPageActive(props.active);

  return (
    <div class={cn(mainShellPageRoot, 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
      <MusicHubShell active={isActive()} />
    </div>
  );
}
