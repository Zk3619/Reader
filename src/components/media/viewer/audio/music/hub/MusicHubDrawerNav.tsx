/**
 * 移动 Drawer 导航（lx DrawerNav）
 */

import { For, Show, type Component } from 'solid-js';
import { Search, Sparkles, ListMusic, Settings2, X, Library, Trophy, Download, Mic2, Disc3 } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { setMusicSection } from '@/stores/viewer/media/audio';
import type { MusicHubSection } from '@/stores/viewer/base-state';
import { viewerStore } from '@/stores/viewer';
import { APP_OVERLAY_BACKDROP_CLASS, APP_SHELL_SHEET_Z } from '@/lib/ui/overlay-z';

const NAV_ITEMS: { id: MusicHubSection; label: string; icon: typeof Search }[] = [
  { id: 'recommend', label: '推荐', icon: Sparkles },
  { id: 'search', label: '搜索', icon: Search },
  { id: 'songlist', label: '在线歌单', icon: Library },
  { id: 'leaderboard', label: '排行', icon: Trophy },
  { id: 'artist', label: '歌手', icon: Mic2 },
  { id: 'album', label: '专辑', icon: Disc3 },
  { id: 'list', label: '列表', icon: ListMusic },
  { id: 'download', label: '下载', icon: Download },
  { id: 'settings', label: '设置', icon: Settings2 },
];

export interface MusicHubDrawerNavProps {
  open: boolean;
  onClose: () => void;
}

export const MusicHubDrawerNav: Component<MusicHubDrawerNavProps> = (props) => {
  const section = () => viewerStore.state.musicSection;

  const select = (id: MusicHubSection) => {
    setMusicSection(id);
    props.onClose();
  };

  return (
    <Show when={props.open}>
      <div class={cn('fixed inset-0 flex', APP_SHELL_SHEET_Z)}>
        <div
          class={cn('absolute inset-0', APP_OVERLAY_BACKDROP_CLASS)}
          onClick={props.onClose}
          role="presentation"
        />
        <aside class="relative z-10 flex h-full w-56 flex-col border-r bg-background shadow-lg">
          <div class="flex items-center justify-between border-b px-4 py-3">
            <span class="text-sm font-medium">音乐</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-8 w-8"
              onClick={props.onClose}
              aria-label="关闭导航"
            >
              <X class="h-5 w-5" />
            </Button>
          </div>
          <nav class="flex flex-1 flex-col gap-1 p-2">
            <For each={NAV_ITEMS}>
              {(item) => {
                const Icon = item.icon;
                const isActive = () => section() === item.id;
                return (
                  <Button
                    type="button"
                    variant="ghost"
                    class={cn(
                      'h-auto justify-start gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                      isActive()
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-muted/60',
                    )}
                    aria-current={isActive() ? 'page' : undefined}
                    onClick={() => select(item.id)}
                  >
                    <Icon class="h-5 w-5" />
                    {item.label}
                  </Button>
                );
              }}
            </For>
          </nav>
        </aside>
      </div>
    </Show>
  );
};
