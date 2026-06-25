import { createEffect, createSignal, onCleanup, splitProps } from 'solid-js';
import {
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger,
} from '@/components/shared/AppTooltip';
import { cn } from '@/lib/utils';

export interface TruncatedTooltipProps {
  text: string;
  class?: string;
  as?: 'span' | 'div';
  /** 阅读器叠层内请为 AppTooltipContent 设置 layer="viewer" */
  layer?: 'app' | 'viewer';
}

function isTextTruncated(el: HTMLElement) {
  return el.scrollWidth > el.clientWidth;
}

export function TruncatedTooltip(props: TruncatedTooltipProps) {
  const [local, others] = splitProps(props, ['text', 'class', 'as', 'layer']);
  const [triggerEl, setTriggerEl] = createSignal<HTMLElement | undefined>();
  const [truncated, setTruncated] = createSignal(false);

  createEffect(() => {
    const el = triggerEl();
    local.text;
    if (!el) {
      setTruncated(false);
      return;
    }
    const update = () => setTruncated(isTextTruncated(el));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    onCleanup(() => ro.disconnect());
  });

  return (
    <AppTooltip disabled={!truncated()}>
      <AppTooltipTrigger
        as={local.as ?? 'span'}
        ref={setTriggerEl}
        class={cn('truncate', local.class)}
        {...others}
      >
        {local.text}
      </AppTooltipTrigger>
      <AppTooltipContent layer={local.layer ?? 'app'}>
        {local.text}
      </AppTooltipContent>
    </AppTooltip>
  );
}
