/**
 * 订阅源图标：优先 meta.iconUrl，其次 Folo icons 服务 / 站点 URL。
 */

import { createEffect, createMemo, createSignal, Show } from 'solid-js';
import { RssIcon } from '@/components/shared/icons';
import {
  resolveSubscribeSourceIconCandidates,
  type SubscribeSourceIconInput,
} from '@/lib/subscribe/presentation';

export function SubscribeSourceLogo(props: {
  source: SubscribeSourceIconInput;
  alt?: string;
  class?: string;
  iconClass?: string;
}) {
  const candidates = createMemo(() => resolveSubscribeSourceIconCandidates(props.source));
  const [index, setIndex] = createSignal(0);
  createEffect(() => {
    candidates();
    setIndex(0);
  });
  const current = () => candidates()[index()] ?? '';

  return (
    <div
      class={
        props.class ??
        'flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded bg-muted'
      }
    >
      <Show
        when={current()}
        fallback={<RssIcon class={props.iconClass ?? 'h-3.5 w-3.5 text-muted-foreground'} />}
      >
        <img
          src={current()}
          alt={props.alt || props.source.title || '订阅源'}
          class="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => {
            if (index() + 1 < candidates().length) setIndex(index() + 1);
            else setIndex(candidates().length);
          }}
        />
      </Show>
    </div>
  );
}
