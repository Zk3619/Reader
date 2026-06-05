import { createEffect, createSignal, onCleanup, Show, Switch, Match, type JSX } from 'solid-js';
import { cn } from '@/lib/utils';

export interface SettingItemAnchorProps {
  id: string;
  highlighted?: boolean;
  children: JSX.Element;
}

const HIGHLIGHT_EXIT_MS = 300;

export function SettingItemAnchor(props: SettingItemAnchorProps) {
  const [renderHighlight, setRenderHighlight] = createSignal(false);
  const [exiting, setExiting] = createSignal(false);

  let outTimer: number | undefined;

  createEffect(() => {
    if (props.highlighted) {
      if (outTimer != null) window.clearTimeout(outTimer);
      outTimer = undefined;
      setExiting(false);
      setRenderHighlight(true);
      return;
    }

    if (!renderHighlight()) return;
    setExiting(true);
    outTimer = window.setTimeout(() => {
      setRenderHighlight(false);
      setExiting(false);
      outTimer = undefined;
    }, HIGHLIGHT_EXIT_MS);
  });

  onCleanup(() => {
    if (outTimer != null) window.clearTimeout(outTimer);
  });

  const highlightBase = cn(
    'setting-item-highlight pointer-events-none absolute inset-0 z-10 rounded-2xl',
  );

  return (
    <div
      id={`setting-item-${props.id}`}
      class="relative scroll-mt-4 scroll-mb-1 overflow-visible rounded-2xl"
    >
      {props.children}
      <Show when={renderHighlight()}>
        <Switch>
          <Match when={!exiting()}>
            <div
              aria-hidden="true"
              class={cn(highlightBase, 'setting-item-highlight-enter')}
            />
          </Match>
          <Match when={exiting()}>
            <div
              aria-hidden="true"
              class={cn(highlightBase, 'setting-item-highlight-exit')}
            />
          </Match>
        </Switch>
      </Show>
    </div>
  );
}
