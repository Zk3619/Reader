/**
 * MusicFree 主题 iframe 槽位组件
 */

import { Show, type Component } from 'solid-js';
import { cn } from '@/lib/utils';

export interface MfThemeIframeSlotProps {
  slot: string;
  src?: string | null;
  class?: string;
  title?: string;
}

export const MfThemeIframeSlot: Component<MfThemeIframeSlotProps> = (props) => (
  <Show when={props.src}>
    <iframe
      src={props.src!}
      class={cn(
        'pointer-events-none absolute inset-0 z-0 h-full w-full border-0',
        props.class,
      )}
      title={props.title ?? `MusicFree 主题 ${props.slot}`}
      aria-hidden="true"
      tabindex={-1}
      scrolling="no"
    />
  </Show>
);
