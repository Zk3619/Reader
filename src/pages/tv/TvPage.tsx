/**
 * 影视模块壳页 — TV-fongmi Hub
 * 首次进入才挂载（懒挂载）；不 await 持久化 hydrate。
 */

import { Show, createEffect, createSignal, type Accessor } from 'solid-js';
import { TvHubShell } from '@/components/viewer/tv/hub/TvHubShell';
import { readShellPageActive } from '@/lib/ui/shell-page-active';
import { cn } from '@/lib/utils';
import { mainShellPageRoot } from '@/lib/ui/viewport-classes';

export interface TvPageProps {
  active?: boolean | Accessor<boolean>;
  /** @deprecated 设置已内嵌 Hub section */
  onOpenTvSettings?: () => void;
}

export function TvPage(props: TvPageProps) {
  const isActive = () => readShellPageActive(props.active);
  const [hubReady, setHubReady] = createSignal(false);

  createEffect(() => {
    if (isActive()) setHubReady(true);
  });

  return (
    <div class={cn(mainShellPageRoot, 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
      <Show when={hubReady()}>
        <TvHubShell active={isActive} />
      </Show>
    </div>
  );
}
