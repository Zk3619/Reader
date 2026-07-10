/**
 * 移动 Drawer 导航（lx DrawerNav）
 */

import { For, Show, type Component } from 'solid-js';
import { Search, ListMusic, Download, Settings2, X, Library, Trophy } from 'lucide-solid';
import { cn } from '@/lib/utils';
import { setMusicSection } from '@/stores/viewer/media/audio';
import type { MusicHubSection } from '@/stores/viewer/base-state';
import { viewerStore } from '@/stores/viewer';

const NAV_ITEMS: { id: MusicHubSection; label: string; icon: typeof Search }[] = [
  { id: 'search', label: '搜索', icon: Search },
  { id: 'songlist', label: '在线歌单', icon: Library },
  { id: 'leaderboard', label: '排行榜', icon: Trophy },
  { id: 'list', label: '我的列表', icon: ListMusic },
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
      <div class="fixed inset-0 z-40 flex">
        <div
          class="absolute inset-0 bg-black/40"
          onClick={props.onClose}
          role="presentation"
        />
        <aside class="relative z-10 flex h-full w-56 flex-col border-r bg-background shadow-lg">
          <div class="flex items-center justify-between border-b px-4 py-3">
            <span class="text-sm font-medium">音乐</span>
            <button type="button" class="rounded p-1 hover:bg-muted" onClick={props.onClose}>
              <X class="h-5 w-5" />
            </button>
          </div>
          <nav class="flex flex-1 flex-col gap-1 p-2">
            <For each={NAV_ITEMS}>
              {(item) => {
                const Icon = item.icon;
                return (
                  <button
                    type="button"
                    class={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                      section() === item.id
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-muted/60',
                    )}
                    onClick={() => select(item.id)}
                  >
                    <Icon class="h-5 w-5" />
                    {item.label}
                  </button>
                );
              }}
            </For>
          </nav>
        </aside>
      </div>
    </Show>
  );
};
