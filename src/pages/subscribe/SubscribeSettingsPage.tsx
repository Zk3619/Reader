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

export interface SubscribeSettingsPageProps {
  onBack?: () => void;
}

export function SubscribeSettingsPage(props: SubscribeSettingsPageProps) {
  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion);

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
        leading={props.onBack ? <SettingsToolbarLeading onBack={props.onBack} /> : undefined}
      />
      <div class={cn(mainShellPageScroll, 'flex min-h-0 flex-1 flex-col')}>
        <div class="flex min-h-0 flex-1 flex-col items-center justify-center pb-4 text-center text-sm text-muted-foreground">
          <p>Folo 订阅源与账号配置将在后续版本提供。</p>
        </div>
      </div>
    </section>
  );
}
