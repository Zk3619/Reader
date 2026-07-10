/**
 * 音乐模块设置页（侧边栏独立子页）
 */

import { PageToolbar } from '@/components/shell/PageToolbar';
import { MusicSettingsPanel } from '@/components/viewer/audio/music/settings/MusicSettingsPanel';
import { mainShellPageRoot } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';

export function MusicSettingsPage() {
  return (
    <div class={cn(mainShellPageRoot, 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
      <PageToolbar title="音乐设置" description="音源、播放、同步与网络" />
      <MusicSettingsPanel />
    </div>
  );
}
