/**
 * 音乐模块设置页（侧边栏独立子页）
 * 页头由 MusicSettingsPanel 内 MusicHubPageShell 提供（含搜索/帮助）
 */

import { MusicSettingsPanel } from '@/components/media/viewer/audio/music/settings/MusicSettingsPanel';
import { mainShellPageRoot, mainShellTabEnterClass } from '@/lib/ui/viewport-classes';
import { settingsStore } from '@/stores/settings';
import { cn } from '@/lib/utils';

export function MusicSettingsPage() {
  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion);

  return (
    <div class={cn(tabEnterClass(), mainShellPageRoot, 'flex min-h-0 flex-1 flex-col')}>
      <MusicSettingsPanel />
    </div>
  );
}
