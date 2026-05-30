/**
 * 分组封面展示（emoji / URL / 默认图标）
 */

import { createSignal } from 'solid-js';
import type { BookGroup } from '@/types';
import { DefaultGroupCoverIcon, BookCoverPlaceholderIcon } from '@/components/bookshelf/book-group-cover-icon';
import { getCoverPreviewInfo } from '@/lib/bookshelf/book-group-cover';
import { cn } from '@/lib/utils';

export function BookGroupCoverFace(props: {
  group: BookGroup;
  compact?: boolean;
  emojiClass?: string;
  iconClass?: string;
  class?: string;
}) {
  const info = () => getCoverPreviewInfo(props.group.cover);
  const [imageFailed, setImageFailed] = createSignal(false);

  const placeholderIcon = () =>
    props.compact ? (
      <BookCoverPlaceholderIcon class={cn('h-4 w-4', props.iconClass)} size={16} />
    ) : (
      <BookCoverPlaceholderIcon class={props.iconClass} />
    );

  const coverContent = () => {
    const preview = info();
    if (!props.group.cover?.trim()) {
      return (
        <DefaultGroupCoverIcon
          group={props.group}
          class={cn(props.compact ? 'h-6 w-6' : 'h-8 w-8', props.iconClass)}
        />
      );
    }
    if (preview.type === 'invalid' || (preview.url && imageFailed())) {
      return placeholderIcon();
    }
    if (preview.type === 'emoji' && props.group.cover) {
      return (
        <span
          class={cn(
            'flex h-full w-full items-center justify-center',
            props.emojiClass ?? (props.compact ? 'text-lg' : 'text-2xl'),
          )}
        >
          {props.group.cover.trim()}
        </span>
      );
    }
    if (preview.url && !imageFailed()) {
      return (
        <img
          src={preview.url}
          alt=""
          class="h-full w-full object-cover"
          draggable={false}
          onError={() => setImageFailed(true)}
        />
      );
    }
    return placeholderIcon();
  };

  return (
    <div class={cn('flex h-full w-full items-center justify-center', props.class)}>
      {coverContent()}
    </div>
  );
}
