import { Show } from 'solid-js';
import { cn } from '@/lib/utils';
import {
  bookshelfCoverTitleOverlayClass,
  bookshelfCoverTitleOverlaySubtitleClass,
  bookshelfCoverTitleOverlayTextClass,
} from '@/lib/bookshelf/bookshelf-title-display';

export function BookshelfCoverTitleOverlay(props: {
  title: string;
  subtitle?: string;
  class?: string;
}) {
  return (
    <div class={cn(bookshelfCoverTitleOverlayClass, props.class)}>
      <div class="flex w-full min-w-0 flex-col items-center justify-center gap-0.5">
        <h3 class={bookshelfCoverTitleOverlayTextClass}>{props.title}</h3>
        <Show when={props.subtitle}>
          {(subtitle) => <p class={bookshelfCoverTitleOverlaySubtitleClass}>{subtitle()}</p>}
        </Show>
      </div>
    </div>
  );
}
