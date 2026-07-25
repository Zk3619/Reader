/**
 * 影视 Hub 壳 — 优先挂页面框架；DB/引擎在后台就绪（对齐阅读/音乐：骨架等待）
 */

import { Show, createEffect, createSignal, type Accessor } from 'solid-js';
import { cn } from '@/lib/utils';
import { mainShellPageRoot } from '@/lib/ui/viewport-classes';
import { ThemeTargetHost } from '@/components/theme/ThemeTargetHost';
import { readShellPageActive } from '@/lib/ui/shell-page-active';
import { whenDatabaseReady } from '@/lib/database';
import { TvHubContent } from './TvHubContent';
import {
  beginTvHubPrepare,
  bootstrapTvConfig,
  endTvHubPrepare,
} from '@/stores/tv-hub/home';

export interface TvHubShellProps {
  active?: boolean | Accessor<boolean>;
}

export function TvHubShell(props: TvHubShellProps) {
  const isActive = () => readShellPageActive(props.active);
  /** 一进入影视就挂框架（工具栏+分区），不堵在开屏/DB 之后 */
  const [frameworkReady, setFrameworkReady] = createSignal(false);
  let bootStarted = false;

  createEffect(() => {
    if (isActive()) setFrameworkReady(true);
  });

  createEffect(() => {
    if (!isActive() || bootStarted) return;
    bootStarted = true;
    beginTvHubPrepare();

    void (async () => {
      try {
        // 等 App 开屏结束后的 initDatabase，禁止抢跑整库迁移 / JAR
        await whenDatabaseReady();
        if (!isActive()) {
          bootStarted = false;
          endTvHubPrepare();
          return;
        }
        await bootstrapTvConfig();
        // restoreWallFromCache 已弃用：影视壁纸能力待主题工作室接入
        window.setTimeout(() => {
          void import('@/lib/media/tv/proxy/bridge').then((m) =>
            m.ensureTvProxyBridge().catch((e) => console.warn('[tv] proxy bridge', e)),
          );
          void import('@/lib/media/tv/local/action-bridge').then((m) =>
            m.ensureTvLocalActionBridge().catch((e) => console.warn('[tv] local bridge', e)),
          );
        }, 0);
      } catch (e) {
        console.warn('[tv] hub boot failed', e);
        bootStarted = false;
        endTvHubPrepare();
      }
    })();
  });

  return (
    <ThemeTargetHost
      target="module.tv"
      class={cn(mainShellPageRoot, 'flex min-h-0 flex-1 flex-col overflow-hidden')}
    >
      <Show when={frameworkReady()}>
        <TvHubContent active={isActive} />
      </Show>
    </ThemeTargetHost>
  );
}
