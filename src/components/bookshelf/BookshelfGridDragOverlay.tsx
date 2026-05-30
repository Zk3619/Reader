/**
 * 书架网格拖拽浮层（书籍 / 分组）
 */

import { Show } from 'solid-js';
import type { Book } from '@/types';
import type { BookGroup } from '@/types';
import { BookCoverFallback } from '@/components/books/BookCoverFallback';
import { BookCoverImg } from '@/components/books/BookCoverImg';
import { BookGroupCoverFace } from '@/components/bookshelf/BookGroupCoverFace';
import {
  bookGroupGridCoverClass,
  bookGroupGridSubtitleClass,
  bookGroupGridTitleClass,
} from '@/lib/bookshelf/book-group-card-styles';
import { sourcesStore } from '@/stores/sources';
import { cn } from '@/lib/utils';

const OVERLAY_SCALE = 2 / 3;

export function BookshelfBookGridDragOverlay(props: {
  book: Book;
  showSubtitle: boolean;
}) {
  return (
    <div class="origin-center" style={{ transform: `scale(${OVERLAY_SCALE})` }}>
      <div
        class={cn(
          'flex w-max max-w-[min(85vw,12rem)] flex-col items-center gap-1.5 rounded-xl border border-border/50 bg-card p-2 text-sm shadow-lg',
        )}
      >
        <div class={bookGroupGridCoverClass('h-24 w-full')}>
          <BookCoverImg
            src={props.book.customCoverUrl || props.book.coverUrl}
            referer={props.book.origin}
            source={sourcesStore.getBookSource(props.book.origin)}
            bookUrl={props.book.bookUrl}
            alt=""
            class="h-full w-full object-cover"
            draggable={false}
            fallback={<BookCoverFallback class="h-8 w-8" />}
          />
        </div>
        <div class="flex w-full min-w-0 flex-col items-center gap-0.5">
          <span class={bookGroupGridTitleClass()}>{props.book.name}</span>
          <Show when={props.showSubtitle}>
            <span class={cn(bookGroupGridSubtitleClass(), 'w-full truncate text-center')}>
              {props.book.author ?? '—'}
            </span>
          </Show>
        </div>
      </div>
    </div>
  );
}

export function BookshelfGroupGridDragOverlay(props: {
  group: BookGroup;
  title: string;
  subtitle: string;
}) {
  return (
    <div class="origin-center" style={{ transform: `scale(${OVERLAY_SCALE})` }}>
      <div
        class={cn(
          'flex w-max max-w-[min(85vw,12rem)] flex-col items-center gap-1.5 rounded-xl border border-border/50 bg-card p-2 text-sm shadow-lg',
        )}
      >
        <div class={bookGroupGridCoverClass('h-24 w-full overflow-hidden')}>
          <BookGroupCoverFace group={props.group} emojiClass="text-3xl" iconClass="h-10 w-10" />
        </div>
        <div class="flex w-full min-w-0 flex-col items-center gap-0.5">
          <span class={bookGroupGridTitleClass()}>{props.title}</span>
          <span class={cn(bookGroupGridSubtitleClass(), 'w-full truncate text-center')}>
            {props.subtitle}
          </span>
        </div>
      </div>
    </div>
  );
}
