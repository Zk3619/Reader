/**
 * 影视 Hub 页头操作：与阅读/音乐一致的 ghost 图标按钮 + tooltip
 */

import type { JSX } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { cn } from '@/lib/utils';

export function TvHubToolbarIconButton(props: {
  label: string;
  disabled?: boolean;
  pressed?: boolean;
  onClick?: () => void;
  children: JSX.Element;
  class?: string;
}) {
  return (
    <AppTooltip>
      <AppTooltipTrigger
        as={Button}
        type="button"
        variant="ghost"
        size="icon"
        class={cn('h-9 w-9 shrink-0', props.pressed && 'bg-accent', props.class)}
        aria-label={props.label}
        aria-pressed={props.pressed}
        disabled={props.disabled}
        onClick={props.onClick}
      >
        {props.children}
        <span class="sr-only">{props.label}</span>
      </AppTooltipTrigger>
      <AppTooltipContent>{props.label}</AppTooltipContent>
    </AppTooltip>
  );
}
