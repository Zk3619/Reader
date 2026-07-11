/**
 * 影视模块壳页（TV-fongmi 占位）
 */

import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import { Button } from '@/components/ui/button';
import { Settings2Icon, GroupVideoIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import {
  mainShellPageRoot,
  mainShellPageScroll,
  mainShellTabEnterClass,
  pageToolbarBottomBorder,
} from '@/lib/ui/viewport-classes';
import { settingsStore } from '@/stores/settings';

export interface TvPageProps {
  onOpenTvSettings?: () => void;
}

export function TvPage(props: TvPageProps) {
  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion);

  return (
    <section class={cn(tabEnterClass(), mainShellPageRoot)}>
      <PageToolbar
        class={pageToolbarBottomBorder}
        title="影视"
        description="TV-fongmi 影视模块（开发中）"
        titleSlot={
          <PageToolbarTitleDropdown
            title="影视"
            description="TV-fongmi 影视模块（开发中）"
            dropdownEnabled={false}
          />
        }
      >
        {props.onOpenTvSettings ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="h-9 w-9"
            aria-label="影视设置"
            onClick={props.onOpenTvSettings}
          >
            <Settings2Icon class="h-4 w-4" />
          </Button>
        ) : undefined}
      </PageToolbar>
      <div class={cn(mainShellPageScroll, 'flex min-h-0 flex-1 flex-col')}>
        <div class="flex min-h-0 flex-1 flex-col items-center justify-center pb-4">
          <GroupVideoIcon class="mb-4 h-16 w-16 text-muted-foreground/40" size={64} />
          <h2 class="text-lg font-semibold text-foreground">影视模块即将接入</h2>
          <p class="mt-2 max-w-md text-center text-sm text-muted-foreground">
            将基于 TV-fongmi 提供影视点播、直播与换源能力。当前为占位页面。
          </p>
        </div>
      </div>
    </section>
  );
}
