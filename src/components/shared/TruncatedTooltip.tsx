import { createEffect, createSignal, onCleanup, splitProps } from 'solid-js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface TruncatedTooltipProps {
  text: string;
  class?: string;
  as?: 'span' | 'div';
}

function isTextTruncated(el: HTMLElement) {
  return el.scrollWidth > el.clientWidth;
}

export function TruncatedTooltip(props: TruncatedTooltipProps) {
  const [local, others] = splitProps(props, ['text', 'class', 'as']);
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
    <Tooltip disabled={!truncated()}>
      <TooltipTrigger
        as={local.as ?? 'span'}
        ref={setTriggerEl}
        class={cn('truncate', local.class)}
        {...others}
      >
        {local.text}
      </TooltipTrigger>
      <TooltipContent>{local.text}</TooltipContent>
    </Tooltip>
  );
}
