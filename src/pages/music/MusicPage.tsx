/**
 * 音乐模块壳页
 */

import { type Accessor } from 'solid-js';
import { MusicHubShell } from '@/components/viewer/audio/music/hub/MusicHubShell';
import { MusicSettingsPage } from '@/pages/music/MusicSettingsPage';
import { useShellLayout } from '@/components/shell/ShellLayoutProvider';
import { readShellPageActive } from '@/lib/ui/shell-page-active';
import { viewerStore } from '@/stores/viewer';
import { cn } from '@/lib/utils';
import { mainShellPageRoot } from '@/lib/ui/viewport-classes';

export interface MusicPageProps {
  active?: boolean | Accessor<boolean>;
}

export function MusicPage(props: MusicPageProps) {
  const shell = useShellLayout();
  const isActive = () => readShellPageActive(props.active);
  const section = () => viewerStore.state.musicSection;
  const useExternalModuleNav = () =>
    shell().showModuleSidebarRail || shell().showFusedModuleNav || shell().showModuleSidebarNav;
  const showStandaloneSettings = () => section() === 'settings' && useExternalModuleNav();

  return (
    <div class={cn(mainShellPageRoot, 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
      <div class={cn('flex min-h-0 flex-1 flex-col', showStandaloneSettings() && 'hidden')}>
        <MusicHubShell active={isActive()} />
      </div>
      <div class={cn('flex min-h-0 flex-1 flex-col', !showStandaloneSettings() && 'hidden')}>
        <MusicSettingsPage />
      </div>
    </div>
  );
}
