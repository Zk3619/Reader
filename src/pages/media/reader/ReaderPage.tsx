/**
 * 阅读模块壳页：内部 Tab 容器（导航由顶栏 / 侧栏承担）
 */

import {
  createEffect,
  type Accessor,
  type JSX,
} from 'solid-js';
import { readShellPageActive } from '@/lib/ui/shell-page-active';
import { applyPendingReaderInternalTab } from '@/lib/modules/shell-compat';
import { readerInternalTabValue } from '@/stores/reader-internal-tab';
import { cn } from '@/lib/utils';
import { mainShellPageRoot } from '@/lib/ui/viewport-classes';

export interface ReaderPageProps {
  active?: boolean | Accessor<boolean>;
  shelf: JSX.Element;
  explore: JSX.Element;
  sources: JSX.Element;
  search: JSX.Element;
  bookmark: JSX.Element;
  record: JSX.Element;
  rss: JSX.Element;
  settings: JSX.Element;
}

export function ReaderPage(props: ReaderPageProps) {
  const isActive = () => readShellPageActive(props.active);
  const tab = () => readerInternalTabValue();

  createEffect(() => {
    if (!isActive()) return;
    applyPendingReaderInternalTab();
  });

  return (
    <div class={cn(mainShellPageRoot, 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
      <div class="relative flex min-h-0 flex-1 flex-col">
        <div class={cn('flex min-h-0 flex-1 flex-col', tab() !== 'shelf' && 'hidden')}>
          {props.shelf}
        </div>
        <div class={cn('flex min-h-0 flex-1 flex-col', tab() !== 'explore' && 'hidden')}>
          {props.explore}
        </div>
        <div class={cn('flex min-h-0 flex-1 flex-col', tab() !== 'sources' && 'hidden')}>
          {props.sources}
        </div>
        <div class={cn('flex min-h-0 flex-1 flex-col', tab() !== 'search' && 'hidden')}>
          {props.search}
        </div>
        <div class={cn('flex min-h-0 flex-1 flex-col', tab() !== 'bookmark' && 'hidden')}>
          {props.bookmark}
        </div>
        <div class={cn('flex min-h-0 flex-1 flex-col', tab() !== 'record' && 'hidden')}>
          {props.record}
        </div>
        <div class={cn('flex min-h-0 flex-1 flex-col', tab() !== 'rss' && 'hidden')}>
          {props.rss}
        </div>
        <div class={cn('flex min-h-0 flex-1 flex-col', tab() !== 'settings' && 'hidden')}>
          {props.settings}
        </div>
      </div>
    </div>
  );
}
