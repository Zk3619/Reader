import { Show } from 'solid-js';
import type { Book } from '@/types';
import type { BookSource } from '@/types';
import { formatBookIntroPlainText } from '@/lib/book-source/intro-merge';
import {
  bookshelfCompactIntroColumnClass,
  bookshelfCompactMainClass,
  bookshelfCompactCoverClass,
  bookshelfCompactRowClass,
  bookshelfListCoverClass,
  bookshelfListIntroColumnClass,
  bookshelfListIntroTextClass,
  bookshelfListMainClass,
  bookshelfRowSubtitleClass,
  bookshelfRowTitleClass,
} from '@/lib/bookshelf/book-group-card-styles';
import { BookCoverFallback } from '@/components/media/reader/books/BookCoverFallback';
import { BookCoverImg } from '@/components/media/reader/books/BookCoverImg';
import { BookCoverPreviewButton } from '@/components/media/reader/books/BookCoverPreviewButton';
import {
  BookShelfCompactReadingMeta,
  BookShelfListBadgeColumn,
  BookShelfListReadingMeta,
} from '@/components/media/reader/bookshelf/BookShelfReadingMeta';
import { cn } from '@/lib/utils';
import type { ViewMode } from '@/stores/bookshelf-layout';

function blockSortableDragFromCover(e: PointerEvent) {
  e.stopPropagation();
}

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
  coverClickPreview?: boolean;
  source?: BookSource | null;
  onCoverUrlRefreshed?: (bookUrl: string, newCoverUrl: string) => void;
  onCoverPreview?: () => void;
}) {
  const intro = () => getBookshelfListItemIntro(props.book);
  const isCompact = () => props.layout === 'compact';
  const introText = () => intro() || '暂无简介';

  const coverClass = () =>
    isCompact() ? bookshelfCompactCoverClass() : bookshelfListCoverClass('rounded-lg');

  const coverDragBlockProps = () =>
    props.coverClickPreview
      ? ({ onPointerDown: blockSortableDragFromCover } as const)
      : ({} as const);

  const coverBlock = () => (
    <Show
      when={props.coverClickPreview}
      fallback={
        <div
          class={coverClass()}
          role="presentation"
          onClick={(e) => e.stopPropagation()}
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
              <BookCoverFallback class={isCompact() ? 'h-5 w-5' : 'h-8 w-8'} />
            }
          />
        </div>
      }
    >
      <BookCoverPreviewButton
        class={coverClass()}
        {...coverDragBlockProps()}
        coverUrl={props.book.coverUrl}
        customCoverUrl={props.book.customCoverUrl}
        bookUrl={props.book.bookUrl}
        origin={props.book.origin}
        source={props.source ?? undefined}
        name={props.book.name}
        onPreview={() => props.onCoverPreview?.()}
        onCoverUrlRefreshed={(url) =>
          props.onCoverUrlRefreshed?.(props.book.bookUrl, url)
        }
        fallback={
          <BookCoverFallback class={isCompact() ? 'h-5 w-5' : 'h-8 w-8'} />
        }
      />
    </Show>
  );

  const mainBlock = () => (
    <div class={isCompact() ? bookshelfCompactMainClass() : bookshelfListMainClass()}>
      <div class="flex min-w-0 items-start gap-1.5">
        <div class="min-w-0 flex-1 overflow-hidden">
          <h3 class={bookshelfRowTitleClass(isCompact())}>
            {props.book.name}
          </h3>
          <p class={bookshelfRowSubtitleClass(isCompact())}>
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

  const leftBlock = () => (
    <div class={cn('flex min-w-0 basis-1/2 flex-1 items-stretch', isCompact() ? 'gap-1.5' : 'gap-3')}>
      {coverBlock()}
      {mainBlock()}
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
          {introText()}
        </p>
      </div>
    </div>
  );

  return (
    <>
      <Show when={isCompact()} fallback={<>{leftBlock()}</>}>
        <div class={bookshelfCompactRowClass(props.viewMode, true)}>
          {leftBlock()}
          {introBlock()}
        </div>
      </Show>

      <Show when={!isCompact()}>{introBlock()}</Show>
    </>
  );
}
