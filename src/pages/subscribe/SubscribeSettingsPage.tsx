/**
 * 订阅模块设置（Folo 占位）
 */

import { PageToolbar } from '@/components/shell/PageToolbar';
import { cn } from '@/lib/utils';
import { mainShellPageRoot, mainShellPageScroll } from '@/lib/ui/viewport-classes';

export interface SubscribeSettingsPageProps {
  onBack?: () => void;
}

export function SubscribeSettingsPage(props: SubscribeSettingsPageProps) {
  return (
    <div class={cn(mainShellPageRoot, 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
      <PageToolbar
        title="订阅设置"
        description="Folo 账号与源（开发中）"
        leading={
          props.onBack ? (
            <button type="button" class="text-sm text-primary" onClick={props.onBack}>
              返回
            </button>
          ) : undefined
        }
      />
      <div class={cn(mainShellPageScroll, 'px-4 py-12 text-center text-sm text-muted-foreground')}>
        <p>Folo 订阅源与账号配置将在后续版本提供。</p>
      </div>
    </div>
  );
}
