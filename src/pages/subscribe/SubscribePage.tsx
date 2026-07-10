/**
 * 订阅模块壳页（Folo 占位）
 */

import { PageToolbar } from '@/components/shell/PageToolbar';
import { Button } from '@/components/ui/button';
import { Settings2Icon, RssTabIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';
import { mainShellPageRoot, mainShellPageScroll } from '@/lib/ui/viewport-classes';

export interface SubscribePageProps {
  onOpenSubscribeSettings?: () => void;
}

export function SubscribePage(props: SubscribePageProps) {
  return (
    <div class={cn(mainShellPageRoot, 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
      <PageToolbar
        title="订阅"
        description="Folo 信息流（开发中）"
        children={
          props.onOpenSubscribeSettings ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-9 w-9"
              aria-label="订阅设置"
              onClick={props.onOpenSubscribeSettings}
            >
              <Settings2Icon class="h-4 w-4" />
            </Button>
          ) : undefined
        }
      />
      <div class={cn(mainShellPageScroll, 'flex flex-1 flex-col items-center justify-center px-6')}>
        <RssTabIcon class="mb-4 h-16 w-16 text-muted-foreground/40" size={64} />
        <h2 class="text-lg font-semibold text-foreground">Folo 订阅即将接入</h2>
        <p class="mt-2 max-w-md text-center text-sm text-muted-foreground">
          将基于 Folo 提供现代化信息流订阅。Legado RSS 仍可在阅读模块的 RSS Tab 中使用。
        </p>
      </div>
    </div>
  );
}
