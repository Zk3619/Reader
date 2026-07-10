/**
 * 影视模块设置（占位）
 */

import { PageToolbar } from '@/components/shell/PageToolbar';
import { cn } from '@/lib/utils';
import { mainShellPageRoot, mainShellPageScroll } from '@/lib/ui/viewport-classes';

export interface TvSettingsPageProps {
  onBack?: () => void;
}

export function TvSettingsPage(props: TvSettingsPageProps) {
  return (
    <div class={cn(mainShellPageRoot, 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
      <PageToolbar
        title="影视设置"
        description="站点与 Spider 配置（开发中）"
        leading={
          props.onBack ? (
            <button type="button" class="text-sm text-primary" onClick={props.onBack}>
              返回
            </button>
          ) : undefined
        }
      />
      <div class={cn(mainShellPageScroll, 'px-4 py-12 text-center text-sm text-muted-foreground')}>
        <p>TV-fongmi 站点配置与 Spider 管理将在后续版本提供。</p>
      </div>
    </div>
  );
}
