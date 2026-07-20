/**
 * 音乐模块设置页（侧边栏独立子页）
 */

import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import { MusicSettingsPanel } from '@/components/media/viewer/audio/music/settings/MusicSettingsPanel';
import {
  mainShellPageRoot,
  mainShellTabEnterClass,
  pageToolbarBottomBorder,
} from '@/lib/ui/viewport-classes';
import { settingsStore } from '@/stores/settings';
import { cn } from '@/lib/utils';

export function MusicSettingsPage() {
  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion);

  return (
    <section class={cn(tabEnterClass(), mainShellPageRoot)}>
      <PageToolbar
        class={pageToolbarBottomBorder}
        title="音乐设置"
        description="音源、播放、同步与网络"
        titleSlot={
          <PageToolbarTitleDropdown
            title="音乐设置"
            description="音源、播放、同步与网络"
            dropdownEnabled={false}
          />
        }
      />
      <MusicSettingsPanel />
    </section>
  );
}
