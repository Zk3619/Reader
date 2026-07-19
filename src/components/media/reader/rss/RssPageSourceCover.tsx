/**
 * 订阅源封面：加载失败或无 URL 时回退 lucide Rss 图标
 */

import { createSignal, Show } from 'solid-js';
import { RssIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';

export interface RssPageSourceCoverProps {
  iconUrl?: string;
  alt?: string;
  class?: string;
  imageClass?: string;
  iconClass?: string;
}

export function RssPageSourceCover(props: RssPageSourceCoverProps) {
  const [failed, setFailed] = createSignal(false);
  const url = () => props.iconUrl?.trim() ?? '';
  const showImage = () => !!url() && !failed();

  return (
    <Show
      when={showImage()}
      fallback={
        <span
          class={cn(
            'flex size-full items-center justify-center bg-muted text-muted-foreground',
            props.class,
          )}
        >
          <RssIcon class={cn('h-5 w-5', props.iconClass)} />
        </span>
      }
    >
      <img
        src={url()}
        alt={props.alt ?? ''}
        class={cn('size-full object-cover', props.imageClass, props.class)}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </Show>
  );
}
