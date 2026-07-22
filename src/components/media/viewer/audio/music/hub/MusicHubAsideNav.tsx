/**
 * Hub 侧栏图标导航（lx Aside）
 */

import { For, type Component } from 'solid-js';
import { Search, ListMusic, Settings2, Library, Trophy, Download, Mic2, Disc3 } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { cn } from '@/lib/utils';
import { setMusicSection } from '@/stores/viewer/media/audio';
import type { MusicHubSection } from '@/stores/viewer/base-state';
import { MusicHubMfThemeSlotLayer } from '@/components/media/viewer/audio/music/hub/MusicHubMfThemeLayer';
import { viewerStore } from '@/stores/viewer';

const NAV_ITEMS: { id: MusicHubSection; label: string; icon: typeof Search }[] = [
  { id: 'search', label: '搜索', icon: Search },
  { id: 'songlist', label: '歌单', icon: Library },
  { id: 'leaderboard', label: '排行榜', icon: Trophy },
  { id: 'artist', label: '歌手', icon: Mic2 },
  { id: 'album', label: '专辑', icon: Disc3 },
  { id: 'list', label: '我的列表', icon: ListMusic },
  { id: 'download', label: '下载', icon: Download },
  { id: 'settings', label: '设置', icon: Settings2 },
];

export const MusicHubAsideNav: Component = () => {
  const section = () => viewerStore.state.musicSection;

  const navButtonClass = (id: MusicHubSection) =>
    cn(
      'flex h-auto flex-col items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs transition-colors',
      section() === id
        ? 'bg-primary/10 text-primary font-medium'
        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
    );

  return (
    <nav class="side-bar-container relative flex w-16 shrink-0 flex-col items-center gap-1 border-r py-3 md:w-20">
      <MusicHubMfThemeSlotLayer slot="side-bar" />
      <For each={NAV_ITEMS}>
        {(item) => {
          const Icon = item.icon;
          const isActive = () => section() === item.id;
          return (
            <AppTooltip>
              <AppTooltipTrigger
                as={Button}
                type="button"
                variant="ghost"
                class={navButtonClass(item.id)}
                data-active={isActive() || undefined}
                onClick={() => setMusicSection(item.id)}
                aria-label={item.label}
                aria-current={isActive() ? 'page' : undefined}
              >
                <Icon class="h-5 w-5" />
                <span class="hidden md:inline">{item.label}</span>
              </AppTooltipTrigger>
              <AppTooltipContent layer="viewer">{item.label}</AppTooltipContent>
            </AppTooltip>
          );
        }}
      </For>
    </nav>
  );
};
