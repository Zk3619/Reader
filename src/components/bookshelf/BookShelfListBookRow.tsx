import { Show } from 'solid-js';
import type { Book } from '@/types';
import type { BookSource } from '@/types';
import { formatBookIntroPlainText } from '@/lib/book-source/intro-merge';
import {
  bookshelfCompactIntroColumnClass,
  bookshelfCompactMainClass,
  bookshelfCompactRowClass,
  bookshelfListCoverClass,
  bookshelfListIntroColumnClass,
  bookshelfListIntroTextClass,
  bookshelfListMainClass,
} from '@/lib/bookshelf/book-group-card-styles';
import { BookCoverImg } from '@/components/books/BookCoverImg';
import {
  BookShelfCompactReadingMeta,
  BookShelfListBadgeColumn,
  BookShelfListReadingMeta,
} from '@/components/bookshelf/BookShelfReadingMeta';
import { cn } from '@/lib/utils';
import type { ViewMode } from '@/stores/bookshelf-layout';

export function getBookshelfListItemIntro(book: Book): string {
  const raw = book.customIntro?.trim() || book.intro?.trim();
  if (!raw) return '';
  return formatBookIntroPlainText(raw);
}

/** 书架列表 / 紧凑列表整行：封面 + 主信息区 + 可选简介 */
export function BookShelfListBookRow(props: {
  book: Book;
  layout: 'list' | 'compact';
  viewMode: ViewMode;
  showUnreadFlag: boolean;
  showLastUpdateTime: boolean;
  source?: BookSource | null;
  onCoverUrlRefreshed?: (bookUrl: string, newCoverUrl: string) => void;
}) {
  const intro = () => getBookshelfListItemIntro(props.book);
  const isCompact = () => props.layout === 'compact';
  const showIntro = () => Boolean(intro());

  const coverBlock = () => (
    <div
      class={bookshelfListCoverClass(isCompact() ? 'rounded-md' : 'rounded-lg')}
    >
      <BookCoverImg
        src={props.book.customCoverUrl || props.book.coverUrl}
        referer={props.book.origin}
        source={props.source ?? undefined}
        bookUrl={props.book.bookUrl}
        onCoverUrlRefreshed={(url) =>
          props.onCoverUrlRefreshed?.(props.book.bookUrl, url)
        }
        alt=""
        class="h-full w-full object-cover"
        draggable={false}
        fallback={
          <span
            class={cn(
              'flex h-full w-full items-center justify-center',
              isCompact() ? 'text-lg' : 'text-2xl',
            )}
          >
            📖
          </span>
        }
      />
    </div>
  );

  const mainBlock = () => (
    <div class={isCompact() ? bookshelfCompactMainClass() : bookshelfListMainClass()}>
      <div class="flex min-w-0 items-start gap-1.5">
        <div class="min-w-0 flex-1 overflow-hidden">
          <h3
            class={cn(
              'truncate font-semibold leading-tight text-foreground',
              isCompact() ? 'text-sm' : 'text-base',
            )}
          >
            {props.book.name}
          </h3>
          <p
            class={cn(
              'truncate leading-tight text-muted-foreground',
              isCompact() ? 'text-xs' : 'text-sm',
            )}
          >
            {props.book.author ?? '—'}
          </p>
        </div>
        <BookShelfListBadgeColumn
          book={props.book}
          showUnreadFlag={props.showUnreadFlag}
          showLastUpdateTime={props.showLastUpdateTime}
        />
      </div>
      <Show when={!isCompact()}>
        <BookShelfListReadingMeta book={props.book} />
      </Show>
      <Show when={isCompact()}>
        <BookShelfCompactReadingMeta book={props.book} />
      </Show>
    </div>
  );

  const introBlock = () => (
    <div
      class={
        isCompact()
          ? bookshelfCompactIntroColumnClass(props.viewMode)
          : bookshelfListIntroColumnClass(props.viewMode)
      }
    >
      <div class="flex h-full w-full items-center justify-center overflow-hidden">
        <p class={bookshelfListIntroTextClass(isCompact() ? 'compact' : 'list')}>
          {intro()}
        </p>
      </div>
    </div>
  );

  return (
    <>
      <Show when={isCompact()} fallback={<>{coverBlock()}{mainBlock()}</>}>
        <div class={bookshelfCompactRowClass(props.viewMode, showIntro())}>
          {coverBlock()}
          {mainBlock()}
          <Show when={showIntro()}>{introBlock()}</Show>
        </div>
      </Show>

      <Show when={!isCompact() && showIntro()}>{introBlock()}</Show>
    </>
  );
}
