/**
 * 列表/卡片内可点击封面（点击查看大图）
 */

import type { JSX } from 'solid-js';
import { BookCoverImg } from '@/components/books/BookCoverImg';
import { BookCoverFallback } from '@/components/books/BookCoverFallback';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { BookSource } from '@/types';

export function BookCoverPreviewButton(props: {
  coverUrl?: string | null;
  customCoverUrl?: string | null;
  bookUrl: string;
  origin?: string;
  source?: BookSource | null;
  name: string;
  onPreview: () => void;
  onCoverUrlRefreshed?: (url: string) => void;
  class?: string;
  imgClass?: string;
  fallback?: JSX.Element;
  onPointerDown?: (e: PointerEvent) => void;
}) {
  const hasCover = () => !!(props.customCoverUrl?.trim() || props.coverUrl?.trim());

  return (
    <Button
      type="button"
      variant="ghost"
      disabled={!hasCover()}
      onPointerDown={(e: PointerEvent) => {
        props.onPointerDown?.(e);
        e.stopPropagation();
      }}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        if (hasCover()) props.onPreview();
      }}
      class={cn(
        'h-auto shrink-0 overflow-hidden p-0 hover:bg-transparent',
        props.class,
      )}
      aria-label="查看封面大图"
    >
      <BookCoverImg
        src={props.customCoverUrl || props.coverUrl}
        referer={props.origin}
        source={props.source}
        bookUrl={props.bookUrl}
        onCoverUrlRefreshed={props.onCoverUrlRefreshed}
        alt=""
        class={props.imgClass ?? 'h-full w-full object-cover'}
        fallback={
          props.fallback ?? <BookCoverFallback class="h-6 w-6" />
        }
      />
    </Button>
  );
}
