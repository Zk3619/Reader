/**
 * 书籍封面占位（lucide BookImage）
 */

import { BookCoverIcon } from '@/components/shared/icons';
import { cn } from '@/lib/utils';

export function BookCoverFallback(props: { class?: string; size?: number }) {
  return (
    <span class="flex h-full w-full items-center justify-center">
      <BookCoverIcon
        class={cn('text-muted-foreground', props.class)}
        size={props.size}
      />
    </span>
  );
}
