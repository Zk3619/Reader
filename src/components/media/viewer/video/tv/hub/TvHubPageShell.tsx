/**
 * 影视 Hub 子页壳层：与阅读 / 音乐模块一致的 PageToolbar + 滚动内容区
 */

import { Show, type JSX } from 'solid-js';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import {
  TV_HUB_SECTION_META,
  tvHubContentInsetClass,
} from '@/lib/media/tv/tv-hub-section-meta';
import type { TvHubSection } from '@/lib/media/tv/types';
import {
  mainShellPageHost,
  mainShellPageRoot,
  mainShellPageScroll,
  mainShellTabEnterClass,
  pageToolbarBottomBorder,
} from '@/lib/ui/viewport-classes';
import { settingsStore } from '@/stores/settings';
import { cn } from '@/lib/utils';

export interface TvHubPageShellProps {
  section: TvHubSection;
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
  description?: string | JSX.Element;
  /** 覆盖默认标题槽（如分组标题下拉） */
  titleSlot?: JSX.Element;
  scrollClass?: string;
  /**
   * 子层自行滚动（VirtualList 等）。
   * 为 true 时外层不用 mainShellPageScroll，避免未滚动容器仍预留双侧 scrollbar-gutter。
   */
  delegateScroll?: boolean;
  /** 隐藏主壳 PageToolbar（如播放页沉浸模式） */
  hideToolbar?: boolean;
  /** 底部固定区（批量操作栏等，位于滚动内容之外） */
  footer?: JSX.Element;
  children: JSX.Element;
}

export function TvHubPageShell(props: TvHubPageShellProps) {
  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion);
  const meta = () => TV_HUB_SECTION_META[props.section];
  const title = () => props.title ?? meta()?.title ?? '';
  const description = () => props.description ?? meta()?.description ?? '';

  const delegateScroll = () =>
    props.delegateScroll === true ||
    (typeof props.scrollClass === 'string' && /\boverflow-hidden\b/.test(props.scrollClass));

  return (
    <section class={cn(tabEnterClass(), mainShellPageRoot, 'min-h-0 flex-1')}>
      <Show when={!props.hideToolbar}>
        <PageToolbar
          class={pageToolbarBottomBorder}
          title={title()}
          description={description()}
          titleSlot={
            props.titleSlot ?? (
              <PageToolbarTitleDropdown
                title={title()}
                description={description()}
                dropdownEnabled={false}
              />
            )
          }
          leading={props.leading}
          below={props.below}
          belowHorizontalWheel={props.belowHorizontalWheel}
        >
          {props.toolbar}
        </PageToolbar>
      </Show>
      <div
        class={cn(
          delegateScroll() ? mainShellPageHost : mainShellPageScroll,
          !delegateScroll() && 'flex min-h-0 flex-1 flex-col',
          !delegateScroll() && tvHubContentInsetClass,
          props.scrollClass,
        )}
      >
        {props.children}
      </div>
      <Show when={props.footer}>{props.footer}</Show>
    </section>
  );
}
