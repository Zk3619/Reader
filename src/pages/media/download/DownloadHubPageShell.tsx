/**
 * 下载模块子页壳层：与音乐 / 订阅 Tab 页一致的 PageToolbar + 滚动内容区
 */

import type { JSX } from 'solid-js';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import {
  DOWNLOAD_HUB_SECTION_META,
  downloadHubContentInsetClass,
} from '@/lib/download/download-hub-section-meta';
import type { DownloadHubSection } from '@/stores/download-hub/section';
import {
  mainShellPageHost,
  mainShellPageRoot,
  mainShellPageScroll,
  mainShellTabEnterClass,
  pageToolbarBottomBorder,
} from '@/lib/ui/viewport-classes';
import { settingsStore } from '@/stores/settings';
import { cn } from '@/lib/utils';

export interface DownloadHubPageShellProps {
  section: DownloadHubSection;
  toolbar?: JSX.Element;
  below?: JSX.Element;
  belowHorizontalWheel?: boolean;
  leading?: JSX.Element;
  title?: string;
  description?: string;
  /** 为 true 时外层用 host（列表自滚）；默认页面级滚动 */
  delegateScroll?: boolean;
  scrollClass?: string;
  children: JSX.Element;
}

export function DownloadHubPageShell(props: DownloadHubPageShellProps) {
  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion);
  const meta = () => DOWNLOAD_HUB_SECTION_META[props.section];
  const title = () => props.title ?? meta().title;
  const description = () => props.description ?? meta().description;

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
        leading={props.leading}
        below={props.below}
        belowHorizontalWheel={props.belowHorizontalWheel}
      >
        {props.toolbar}
      </PageToolbar>
      <div
        class={cn(
          props.delegateScroll ? mainShellPageHost : mainShellPageScroll,
          !props.delegateScroll && 'flex min-h-0 flex-1 flex-col',
          !props.delegateScroll && downloadHubContentInsetClass,
          props.scrollClass,
        )}
      >
        {props.children}
      </div>
    </section>
  );
}
