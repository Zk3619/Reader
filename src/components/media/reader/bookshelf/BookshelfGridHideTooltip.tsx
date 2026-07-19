import { Show, type JSX } from 'solid-js';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';

/** 网格布局且书名/分组名为「隐藏」时，悬停卡片显示标题与副标题 */
export function BookshelfGridHideTooltip(props: {
  enabled: boolean;
  title: string;
  subtitle?: string;
  children: JSX.Element;
}) {
  return (
    <Show when={props.enabled} fallback={props.children}>
      <AppTooltip gutter={6} openDelay={400}>
        <AppTooltipTrigger
          as="div"
          class="flex w-full min-w-0 flex-col items-center gap-1.5 outline-none"
        >
          {props.children}
        </AppTooltipTrigger>
        <AppTooltipContent class="z-50 max-w-[min(16rem,80vw)]">
          <div class="space-y-0.5 text-center">
            <p class="font-medium leading-snug">{props.title}</p>
            <Show when={props.subtitle}>
              <p class="text-xs text-popover-foreground/80">{props.subtitle}</p>
            </Show>
          </div>
        </AppTooltipContent>
      </AppTooltip>
    </Show>
  );
}
