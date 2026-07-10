/**
 * 移动布局：DrawerNav + Header + Main + PlayerBar
 */

import { createSignal, For, Show, type Accessor, type Component } from 'solid-js';
import { Menu, Search, ListMusic, Settings2, Library, Trophy } from 'lucide-solid';
import { MusicHubDrawerNav } from '@/components/viewer/audio/music/hub/MusicHubDrawerNav';
import { MusicHubContent } from '@/components/viewer/audio/music/hub/MusicHubContent';
import { MusicHubPlayBar } from '@/components/viewer/audio/music/hub/MusicHubPlayBar';
import type { useMusicHubPlayer } from '@/components/viewer/audio/music/hub/useMusicHubPlayer';
import { viewerStore } from '@/stores/viewer';
import { setMusicSection } from '@/stores/viewer/media/audio';
import type { MusicHubSection } from '@/stores/viewer/base-state';
import { cn } from '@/lib/utils';

const SECTION_LABELS: Record<MusicHubSection, string> = {
  search: '搜索',
  songlist: '在线歌单',
  leaderboard: '排行榜',
  album: '专辑',
  singer: '歌手',
  userApi: 'UserApi',
  list: '我的列表',
  download: '下载',
  settings: '设置',
  nowPlaying: '正在播放',
};

const BOTTOM_NAV: { id: MusicHubSection; label: string; icon: typeof Search }[] = [
  { id: 'search', label: '搜索', icon: Search },
  { id: 'songlist', label: '歌单', icon: Library },
  { id: 'leaderboard', label: '榜', icon: Trophy },
  { id: 'list', label: '列表', icon: ListMusic },
  { id: 'settings', label: '设置', icon: Settings2 },
];

export interface MusicHubMobileLayoutProps {
  player: ReturnType<typeof useMusicHubPlayer>;
  active?: boolean | Accessor<boolean>;
  hideChrome?: boolean;
}

export const MusicHubMobileLayout: Component<MusicHubMobileLayoutProps> = (props) => {
  const [drawerOpen, setDrawerOpen] = createSignal(false);
  const [listDrawerOpen, setListDrawerOpen] = createSignal(false);

  const section = () => viewerStore.state.musicSection;

  const navButtonClass = (id: MusicHubSection) =>
    cn(
      'flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-2 text-xs transition-colors',
      section() === id
        ? 'text-primary font-medium'
        : 'text-muted-foreground',
    );

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <Show when={!props.hideChrome}>
        <header class="flex shrink-0 items-center gap-2 border-b px-3 py-2">
          <button
            type="button"
            class="rounded p-1.5 hover:bg-muted"
            onClick={() => setDrawerOpen(true)}
            aria-label="打开导航"
          >
            <Menu class="h-5 w-5" />
          </button>
          <span class="text-sm font-medium">{SECTION_LABELS[section()]}</span>
        </header>
      </Show>

      <MusicHubDrawerNav open={drawerOpen()} onClose={() => setDrawerOpen(false)} />

      <MusicHubContent
        player={props.player}
        listDrawerOpen={listDrawerOpen()}
        onListDrawerToggle={() => setListDrawerOpen((v) => !v)}
      />

      <Show when={!props.hideChrome}>
        <nav class="flex shrink-0 items-center justify-around border-t px-1 py-0.5">
          <For each={BOTTOM_NAV}>
            {(item) => {
              const Icon = item.icon;
              return (
                <button
                  type="button"
                  class={navButtonClass(item.id)}
                  onClick={() => setMusicSection(item.id)}
                >
                  <Icon class="h-5 w-5" />
                  <span>{item.label}</span>
                </button>
              );
            }}
          </For>
        </nav>
      </Show>

      <MusicHubPlayBar player={props.player} />
    </div>
  );
};
