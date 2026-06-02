/**
 * 探索页文本列表单元
 */

import { Show } from 'solid-js';
import type { SearchBook } from '@/types';
import { bookGroupCardPressHandlers } from '@/lib/bookshelf/book-group-card-press';
import { cn } from '@/lib/utils';
import { explorePageLayoutStore } from '@/stores/explore-page-layout';

export interface ExploreBookTextListCellProps {
  bookUrl: string;
  booksByUrl: Record<string, SearchBook>;
  onOpen: (book: SearchBook) => void;
}

export function ExploreBookTextListCell(props: ExploreBookTextListCellProps) {
  const book = () => props.booksByUrl[props.bookUrl];

  return (
    <Show when={book()}>
      <ExploreBookTextListCellContent
        book={book as () => SearchBook}
        onOpen={props.onOpen}
      />
    </Show>
  );
}

function ExploreBookTextListCellContent(props: {
  book: () => SearchBook;
  onOpen: (book: SearchBook) => void;
}) {
  const compact = () => explorePageLayoutStore.settings.dataDisplayMode === 'compact';

  return (
    <li class="w-full list-none">
      <button
        type="button"
        class={cn(
          'flex w-full flex-col gap-0.5 border-b border-border/40 px-3 py-2 text-left transition-colors',
          'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        onClick={() => props.onOpen(props.book())}
        {...bookGroupCardPressHandlers}
      >
        <p class="m-0 truncate text-sm font-medium leading-5 text-foreground">{props.book().name}</p>
        <Show when={!compact()}>
          <p class="m-0 truncate text-xs leading-5 text-muted-foreground">
            作者：{props.book().author || '—'}
          </p>
        </Show>
      </button>
    </li>
  );
}
