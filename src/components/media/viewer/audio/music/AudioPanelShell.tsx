/**
 * 音频面板壳：drawer 或 inline 两种呈现
 */

import { Show, type JSX } from 'solid-js';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { APP_OVERLAY_BACKDROP_CLASS, APP_SHELL_SHEET_Z } from '@/lib/ui/overlay-z';

export interface AudioPanelShellProps {
  open: boolean;
  inline?: boolean;
  title: string;
  onClose?: () => void;
  headerExtra?: JSX.Element;
  /** inline 嵌入 Hub 子页时由 PageToolbar 承担标题 */
  hideHeader?: boolean;
  class?: string;
  children: JSX.Element;
}

export function AudioPanelShell(props: AudioPanelShellProps) {
  const body = (
    <>
      <Show when={!props.hideHeader}>
        <div class="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <h2 class="font-semibold">{props.title}</h2>
          <div class="flex items-center gap-2">
            {props.headerExtra}
            <Show when={!props.inline && props.onClose}>
              <Button variant="ghost" size="sm" onClick={props.onClose}>
                关闭
              </Button>
            </Show>
          </div>
        </div>
      </Show>
      <div class={cn('min-h-0 flex-1 overflow-y-auto', props.class)}>{props.children}</div>
    </>
  );

  return (
    <Show when={props.inline || props.open}>
      <Show
        when={props.inline}
        fallback={
          <div class={cn('fixed inset-0 flex', APP_SHELL_SHEET_Z)}>
            <div class={cn('absolute inset-0', APP_OVERLAY_BACKDROP_CLASS)} onClick={props.onClose} />
            <aside class="relative ml-auto flex h-full w-full max-w-md flex-col border-l bg-background shadow-xl">
              {body}
            </aside>
          </div>
        }
      >
        <div class="flex min-h-0 flex-1 flex-col">{body}</div>
      </Show>
    </Show>
  );
}
