/**
 * 探索页卡片网格单元（与书架网格卡片布局一致）
 */

import { Show } from 'solid-js';
import { BookCoverImg } from '@/components/books/BookCoverImg';
import { BookCoverIcon } from '@/components/shared/icons';
import type { BookSource, SearchBook } from '@/types';
import {
  bookGroupGridCardClass,
  bookGroupGridCoverClass,
  bookGroupGridSubtitleClass,
  bookGroupGridTitleClass,
} from '@/lib/bookshelf/book-group-card-styles';
import { bookGroupCardPressHandlers } from '@/lib/bookshelf/book-group-card-press';
import { explorePageLayoutStore } from '@/stores/explore-page-layout';
import { cn } from '@/lib/utils';

export interface ExploreBookGridCardCellProps {
  bookUrl: string;
  booksByUrl: Record<string, SearchBook>;
  source: BookSource;
  onOpen: (book: SearchBook) => void;
  onCoverUrlRefreshed: (bookUrl: string, url: string) => void;
}

function ExploreBookGridCardCellContent(props: {
  book: () => SearchBook;
  bookUrl: string;
  booksByUrl: Record<string, SearchBook>;
  source: BookSource;
  onOpen: (book: SearchBook) => void;
  onCoverUrlRefreshed: (bookUrl: string, url: string) => void;
}) {
  const showCover = () => explorePageLayoutStore.settings.showCover;
  const compact = () => explorePageLayoutStore.settings.dataDisplayMode === 'compact';
  const coverUrl = () => props.booksByUrl[props.bookUrl]?.coverUrl;
  const origin = () => props.booksByUrl[props.bookUrl]?.origin;

  return (
    <li class="w-full list-none">
      <button
        type="button"
        class={cn(bookGroupGridCardClass(), 'cursor-pointer text-left')}
        onClick={() => props.onOpen(props.book())}
        {...bookGroupCardPressHandlers}
      >
        <Show when={showCover()}>
          <div class={bookGroupGridCoverClass()}>
            <BookCoverImg
              src={coverUrl()}
              referer={origin()}
              source={props.source}
              bookUrl={props.book().bookUrl}
              onCoverUrlRefreshed={(url) =>
                props.onCoverUrlRefreshed(props.book().bookUrl, url)
              }
              alt=""
              class="h-full w-full object-cover"
              loading="lazy"
              draggable={false}
              deferLoadUntilVisible
              fallback={
                <div class="flex h-full w-full items-center justify-center">
                  <BookCoverIcon class="h-8 w-8 text-muted-foreground" size={32} />
                </div>
              }
            />
          </div>
        </Show>
        <div class="flex w-full flex-col items-center gap-0.5">
          <h3 class={bookGroupGridTitleClass()}>{props.book().name}</h3>
          <Show when={!compact()}>
            <p class={cn(bookGroupGridSubtitleClass(), 'w-full truncate text-center')}>
              {props.book().author || '—'}
            </p>
          </Show>
        </div>
      </button>
    </li>
  );
}

export function ExploreBookGridCardCell(props: ExploreBookGridCardCellProps) {
  const book = () => props.booksByUrl[props.bookUrl];

  return (
    <Show when={book()}>
      <ExploreBookGridCardCellContent
        book={book as () => SearchBook}
        bookUrl={props.bookUrl}
        booksByUrl={props.booksByUrl}
        source={props.source}
        onOpen={props.onOpen}
        onCoverUrlRefreshed={props.onCoverUrlRefreshed}
      />
    </Show>
  );
}
