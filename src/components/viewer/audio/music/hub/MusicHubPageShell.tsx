/**
 * 音乐 Hub 子页壳层：与阅读模块 Tab 页一致的 PageToolbar + 滚动内容区
 */

import type { JSX } from 'solid-js';
import { Menu } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import {
  useMusicExternalModuleNav,
  useMusicHubMobileChrome,
} from '@/components/viewer/audio/music/hub/music-hub-mobile-chrome';
import type { MusicHubSection } from '@/stores/viewer/base-state';
import { MUSIC_HUB_SECTION_META } from '@/lib/media/audio/music-hub-section-meta';
import {
  mainShellPageRoot,
  mainShellPageScroll,
  mainShellTabEnterClass,
  pageToolbarBottomBorder,
} from '@/lib/ui/viewport-classes';
import { settingsStore } from '@/stores/settings';
import { cn } from '@/lib/utils';

export interface MusicHubPageShellProps {
  section: MusicHubSection;
  /** PageToolbar 主行右侧操作区 */
  toolbar?: JSX.Element;
  /** PageToolbar 第二行（筛选、Tab 等） */
  below?: JSX.Element;
  /** 为 true 时 below 外包横滚视口 */
  belowHorizontalWheel?: boolean;
  /** 标题左侧（如返回） */
  leading?: JSX.Element;
  /** 覆盖默认标题 */
  title?: string;
  /** 覆盖默认描述 */
  description?: string;
  scrollClass?: string;
  children: JSX.Element;
}

export function MusicHubPageShell(props: MusicHubPageShellProps) {
  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion);
  const meta = () => MUSIC_HUB_SECTION_META[props.section];
  const title = () => props.title ?? meta().title;
  const description = () => props.description ?? meta().description;
  const mobileChrome = useMusicHubMobileChrome();
  const useExternalModuleNav = useMusicExternalModuleNav();

  const leading = () => {
    if (props.leading) return props.leading;
    if (useExternalModuleNav()) return undefined;
    const openDrawer = mobileChrome().onOpenDrawer;
    if (!openDrawer) return undefined;
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        class="h-9 w-9 shrink-0"
        aria-label="打开导航"
        onClick={openDrawer}
      >
        <Menu class="h-5 w-5" />
      </Button>
    );
  };

  return (
    <section class={cn(tabEnterClass(), mainShellPageRoot, 'min-h-0 flex-1')}>
      <PageToolbar
        class={pageToolbarBottomBorder}
        title={title()}
        description={description()}
        titleSlot={
          <PageToolbarTitleDropdown
            title={title()}
            description={description()}
            dropdownEnabled={false}
          />
        }
        leading={leading()}
        below={props.below}
        belowHorizontalWheel={props.belowHorizontalWheel}
      >
        {props.toolbar}
      </PageToolbar>
      <div class={cn(mainShellPageScroll, 'flex min-h-0 flex-1 flex-col', props.scrollClass)}>
        {props.children}
      </div>
    </section>
  );
}
