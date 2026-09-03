/**
 * 移动布局：DrawerNav + Header + Main + PlayerBar
 */

import { createSignal, For, Show, type Accessor, type Component } from 'solid-js';
import { Search, Sparkles, ListMusic, Settings2, Library, Trophy, Download } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { MusicCellularWarningBanner } from '@/components/media/viewer/audio/music/hub/MusicCellularWarningBanner';
import { MusicHubDrawerNav } from '@/components/media/viewer/audio/music/hub/MusicHubDrawerNav';
import { MusicHubContent } from '@/components/media/viewer/audio/music/hub/MusicHubContent';
import { MusicHubPlayBar } from '@/components/media/viewer/audio/music/hub/MusicHubPlayBar';
import { MusicHubMobileChromeContext } from '@/components/media/viewer/audio/music/hub/music-hub-mobile-chrome';
import type { useMusicHubPlayer } from '@/components/media/viewer/audio/music/hub/useMusicHubPlayer';
import { viewerStore } from '@/stores/viewer';
import { setMusicSection } from '@/stores/viewer/media/audio';
import type { MusicHubSection } from '@/stores/viewer/base-state';
import { cn } from '@/lib/utils';
import { useBackLayer } from '@/lib/navigation/use-back-layer';

const BOTTOM_NAV: { id: MusicHubSection; label: string; icon: typeof Search }[] = [
  { id: 'recommend', label: '推荐', icon: Sparkles },
  { id: 'search', label: '搜索', icon: Search },
  { id: 'songlist', label: '歌单', icon: Library },
  { id: 'leaderboard', label: '榜', icon: Trophy },
  { id: 'list', label: '列表', icon: ListMusic },
  { id: 'download', label: '下载', icon: Download },
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
  useBackLayer(drawerOpen, () => setDrawerOpen(false));
  useBackLayer(listDrawerOpen, () => setListDrawerOpen(false));

  const section = () => viewerStore.state.musicSection;
  const inPlayDetail = () => section() === 'nowPlaying';

  const navButtonClass = (id: MusicHubSection) =>
    cn(
      'flex h-auto flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-2 text-xs transition-colors',
      section() === id
        ? 'text-primary font-medium'
        : 'text-muted-foreground',
    );

  return (
    <MusicHubMobileChromeContext.Provider
      value={() =>
        props.hideChrome
          ? {}
          : { onOpenDrawer: () => setDrawerOpen(true) }
      }
    >
      <div class="body-container relative flex min-h-0 flex-1 flex-col">
        <MusicCellularWarningBanner />
        <MusicHubDrawerNav open={drawerOpen()} onClose={() => setDrawerOpen(false)} />

        <MusicHubContent
          player={props.player}
          listDrawerOpen={listDrawerOpen()}
          onListDrawerToggle={() => setListDrawerOpen((v) => !v)}
        />

        <Show when={!props.hideChrome && !inPlayDetail()}>
          <nav class="flex shrink-0 items-center justify-around border-t px-1 py-0.5">
            <For each={BOTTOM_NAV}>
              {(item) => {
                const Icon = item.icon;
                const isActive = () => section() === item.id;
                return (
                  <Button
                    type="button"
                    variant="ghost"
                    class={cn(
                      navButtonClass(item.id),
                      isActive() && 'text-primary font-medium',
                    )}
                    aria-current={isActive() ? 'page' : undefined}
                    onClick={() => setMusicSection(item.id)}
                  >
                    <Icon class="h-5 w-5" />
                    <span>{item.label}</span>
                  </Button>
                );
              }}
            </For>
          </nav>
        </Show>

        <Show when={!inPlayDetail()}>
          <MusicHubPlayBar player={props.player} />
        </Show>
      </div>
    </MusicHubMobileChromeContext.Provider>
  );
};
