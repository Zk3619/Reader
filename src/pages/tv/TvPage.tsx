/**
 * 影视模块壳页（TV-fongmi 占位）
 */

import { PageToolbar } from '@/components/shell/PageToolbar';
import { Button } from '@/components/ui/button';
import { Settings2Icon, GroupVideoIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import { mainShellPageRoot, mainShellPageScroll } from '@/lib/ui/viewport-classes';

export interface TvPageProps {
  onOpenTvSettings?: () => void;
}

export function TvPage(props: TvPageProps) {
  return (
    <div class={cn(mainShellPageRoot, 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
      <PageToolbar
        title="影视"
        description="TV-fongmi 影视模块（开发中）"
        children={
          props.onOpenTvSettings ? (
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
          ) : undefined
        }
      />
      <div class={cn(mainShellPageScroll, 'flex flex-1 flex-col items-center justify-center px-6')}>
        <GroupVideoIcon class="mb-4 h-16 w-16 text-muted-foreground/40" size={64} />
        <h2 class="text-lg font-semibold text-foreground">影视模块即将接入</h2>
        <p class="mt-2 max-w-md text-center text-sm text-muted-foreground">
          将基于 TV-fongmi 提供影视点播、直播与换源能力。当前为占位页面。
        </p>
      </div>
    </div>
  );
}
