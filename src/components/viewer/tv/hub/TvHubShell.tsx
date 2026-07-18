/**
 * 影视 Hub 壳 — 对齐 MusicHubShell 懒挂载分区
 */

import { Show, createEffect, createSignal, type Accessor } from 'solid-js';
import { cn } from '@/lib/utils';
import { mainShellPageRoot } from '@/lib/ui/viewport-classes';
import { ThemeTargetHost } from '@/components/theme/ThemeTargetHost';
import { readShellPageActive } from '@/lib/ui/shell-page-active';
import { TvHubContent } from './TvHubContent';
import { bootstrapTvConfig } from '@/stores/tv-hub/home';
import { ensureTvProxyBridge } from '@/lib/media/tv/proxy/bridge';
import { ensureTvLocalActionBridge } from '@/lib/media/tv/local/action-bridge';

export interface TvHubShellProps {
  active?: boolean | Accessor<boolean>;
}

export function TvHubShell(props: TvHubShellProps) {
  const isActive = () => readShellPageActive(props.active);
  const [booted, setBooted] = createSignal(false);

  createEffect(() => {
    if (isActive() && !booted()) {
      setBooted(true);
      void bootstrapTvConfig();
      void ensureTvProxyBridge();
      void ensureTvLocalActionBridge();
    }
  });

  return (
    <ThemeTargetHost
      target="module.tv"
      class={cn(mainShellPageRoot, 'flex min-h-0 flex-1 flex-col overflow-hidden')}
    >
      <Show when={booted()}>
        <TvHubContent active={isActive} />
      </Show>
    </ThemeTargetHost>
  );
}
