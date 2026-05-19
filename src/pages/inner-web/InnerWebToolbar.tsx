/**
 * 内嵌网页专用顶栏（对齐 Legado WebViewActivity：返回、标题、刷新、√）
 * Tauri 桌面子 WebView 模式：附带窗口控制与拖拽区（主窗口无边框）。
 */

import { Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { WindowControlButtons } from '@/components/WindowControlButtons';
import { withBlurBefore } from '@/utils/accessibility';
import { cn } from '@/lib/utils';
import { ChevronLeftIcon, CheckIcon, RefreshIcon } from '@/components/icons';
import { isMobile, isTauri } from '@/lib/platform/detect';

export interface InnerWebToolbarProps {
  title: string;
  onBack: () => void;
  onConfirm?: () => void;
  onRefresh?: () => void;
  showConfirm?: boolean;
  confirmLoading?: boolean;
  /** Tauri 桌面子 WebView：显示窗口控制并支持拖拽 */
  showWindowControls?: boolean;
  /** 默认 true；inner-web 关闭时避免 blur 触发下层 Dialog 误关 */
  blurBeforeAction?: boolean;
  class?: string;
}

export function InnerWebToolbar(props: InnerWebToolbarProps) {
  const showRefresh = () => Boolean(props.onRefresh);
  const showWindowControls = () =>
    props.showWindowControls !== false && isTauri() && !isMobile();
  const wrapAction = <T extends (event: Event) => void>(fn?: T) =>
    props.blurBeforeAction === false ? fn : withBlurBefore(fn);

  return (
    <header
      class={cn(
        'relative z-1 flex h-12 shrink-0 items-center gap-1 border-b border-border bg-background px-1 backdrop-blur-sm',
        isTauri() && 'select-none',
        showWindowControls() && 'data-tauri-drag-region',
        props.class
      )}
    >
      <div class={cn('flex min-w-0 flex-1 items-center gap-1', showWindowControls() && 'no-drag')}>
        <Tooltip>
          <TooltipTrigger as="div">
            <Button
              variant="ghost"
              size="icon"
              class="h-9 w-9 shrink-0"
              onClick={wrapAction(props.onBack)}
              aria-label="返回"
            >
              <ChevronLeftIcon class="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>返回</TooltipContent>
        </Tooltip>

        <h1
          class="min-w-0 flex-1 truncate px-1 text-base font-medium"
          title={props.title}
          data-tauri-drag-region={showWindowControls() ? true : undefined}
        >
          {props.title}
        </h1>

        <div class="flex shrink-0 items-center gap-0.5">
          <Show when={showRefresh()}>
            <Tooltip>
              <TooltipTrigger as="div">
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-9 w-9"
                  onClick={wrapAction(() => props.onRefresh?.())}
                  aria-label="刷新"
                >
                  <RefreshIcon class="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>刷新</TooltipContent>
            </Tooltip>
          </Show>

          <Show when={props.showConfirm}>
            <Tooltip>
              <TooltipTrigger as="div">
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-9 w-9 text-primary"
                  disabled={props.confirmLoading}
                  onClick={wrapAction(() => props.onConfirm?.())}
                  aria-label="完成"
                >
                  <CheckIcon class="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>完成（保存并关闭）</TooltipContent>
            </Tooltip>
          </Show>
        </div>
      </div>

      <Show when={showWindowControls()}>
        <Separator orientation="vertical" class="mx-1 h-6 no-drag" />
        <div class="no-drag shrink-0">
          <WindowControlButtons />
        </div>
      </Show>
    </header>
  );
}
