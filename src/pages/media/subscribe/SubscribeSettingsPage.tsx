/**
 * 订阅模块设置（Folo 占位）
 */

import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import { SettingsToolbarLeading } from '@/components/shell/SettingsPageToolbar';
import { cn } from '@/lib/utils';
import {
  mainShellPageRoot,
  mainShellPageScroll,
  mainShellTabEnterClass,
  pageToolbarBottomBorder,
} from '@/lib/ui/viewport-classes';
import { settingsStore } from '@/stores/settings';
import { setSubscribeSection } from '@/stores/subscribe-hub/section';
import { createResource } from 'solid-js';
import {
  getSubscribeConfig,
  saveSubscribeConfig,
} from '@/lib/persistence/domains/subscribe-config';
import { Button } from '@/components/ui/button';

export interface SubscribeSettingsPageProps {
  onBack?: () => void;
}

export function SubscribeSettingsPage(props: SubscribeSettingsPageProps) {
  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion);
  const [config, { refetch }] = createResource(() => getSubscribeConfig());

  return (
    <section class={cn(tabEnterClass(), mainShellPageRoot)}>
      <PageToolbar
        class={pageToolbarBottomBorder}
        title="订阅设置"
        description="Folo 账号与源（开发中）"
        titleSlot={
          <PageToolbarTitleDropdown
            title="订阅设置"
            description="Folo 账号与源（开发中）"
            dropdownEnabled={false}
          />
        }
        leading={
          props.onBack ? (
            <SettingsToolbarLeading
              onBack={() => {
                setSubscribeSection('home');
                props.onBack?.();
              }}
            />
          ) : undefined
        }
      />
      <div class={cn(mainShellPageScroll, 'flex min-h-0 flex-1 flex-col')}>
        <div class="flex min-h-0 flex-1 flex-col gap-3 p-3">
          <section class="rounded-md border bg-card p-3">
            <h3 class="text-sm font-medium">订阅行为</h3>
            <p class="mt-1 text-xs text-muted-foreground">仅影响新订阅模块，不影响 legado RSS。</p>
            <div class="mt-3 flex items-center justify-between">
              <span class="text-sm">进入订阅页自动刷新</span>
              <Button
                size="sm"
                variant={config()?.autoRefreshOnOpen ? 'default' : 'outline'}
                onClick={() =>
                  void saveSubscribeConfig({
                    autoRefreshOnOpen: !config()?.autoRefreshOnOpen,
                  }).then(() => refetch())
                }
              >
                {config()?.autoRefreshOnOpen ? '已开启' : '已关闭'}
              </Button>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
