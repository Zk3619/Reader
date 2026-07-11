/**
 * 影视模块设置（占位）
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

export interface TvSettingsPageProps {
  onBack?: () => void;
}

export function TvSettingsPage(props: TvSettingsPageProps) {
  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion);

  return (
    <section class={cn(tabEnterClass(), mainShellPageRoot)}>
      <PageToolbar
        class={pageToolbarBottomBorder}
        title="影视设置"
        description="站点与 Spider 配置（开发中）"
        titleSlot={
          <PageToolbarTitleDropdown
            title="影视设置"
            description="站点与 Spider 配置（开发中）"
            dropdownEnabled={false}
          />
        }
        leading={props.onBack ? <SettingsToolbarLeading onBack={props.onBack} /> : undefined}
      />
      <div class={cn(mainShellPageScroll, 'flex min-h-0 flex-1 flex-col')}>
        <div class="flex min-h-0 flex-1 flex-col items-center justify-center pb-4 text-center text-sm text-muted-foreground">
          <p>TV-fongmi 站点配置与 Spider 管理将在后续版本提供。</p>
        </div>
      </div>
    </section>
  );
}
