/**
 * 音乐 Hub 子页壳层：与阅读模块 Tab 页一致的 PageToolbar + 滚动内容区
 */

import { createSignal, Show, type Accessor, type JSX } from 'solid-js';
import { Menu } from 'lucide-solid';
import { Button } from '@/components/ui/button';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import {
  useMusicExternalModuleNav,
  useMusicHubMobileChrome,
} from '@/components/viewer/audio/music/hub/music-hub-mobile-chrome';
import { MusicHubQuickScroll } from '@/components/viewer/audio/music/hub/MusicHubQuickScroll';
import type { MusicHubSection } from '@/stores/viewer/base-state';
import {
  MUSIC_HUB_SECTION_META,
  musicHubContentInsetClass,
} from '@/lib/media/audio/music-hub-section-meta';
import {
  mainShellPageHost,
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
  /**
   * 子层自行滚动（VirtualList 等）。
   * 为 true 时外层不用 mainShellPageScroll，避免未滚动容器仍预留双侧 scrollbar-gutter。
   */
  delegateScroll?: boolean;
  /** 为页面级滚动区挂载到顶/到底按钮（VirtualList 自滚页面请自行在列表侧挂载） */
  enableQuickScroll?: boolean;
  /** 列表内容变化时刷新快速滚动可见性 */
  quickScrollContentRevision?: Accessor<unknown>;
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
  const [scrollEl, setScrollEl] = createSignal<HTMLElement | undefined>();

  /** 列表自滚：外层只做裁切，沟槽留给真正的滚动容器 */
  const delegateScroll = () =>
    props.delegateScroll === true ||
    (typeof props.scrollClass === 'string' && /\boverflow-hidden\b/.test(props.scrollClass));

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
      <div
        ref={(el) => setScrollEl(el)}
        class={cn(
          delegateScroll() ? mainShellPageHost : mainShellPageScroll,
          !delegateScroll() && 'flex min-h-0 flex-1 flex-col',
          !delegateScroll() && musicHubContentInsetClass,
          props.scrollClass,
        )}
      >
        {props.children}
      </div>
      <Show when={props.enableQuickScroll}>
        <MusicHubQuickScroll
          container={scrollEl}
          contentRevision={props.quickScrollContentRevision}
        />
      </Show>
    </section>
  );
}
