import { For, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BookCoverImg } from '@/components/books/BookCoverImg';
import type { MergedSearchBook } from '@/lib/book-source/multi-source-search';
import { cn } from '@/lib/utils';

export interface SearchBookResultRowProps {
  book: MergedSearchBook;
  onShelf: boolean;
  onOpen: () => void;
  onAddToShelf?: () => void;
  adding?: boolean;
  class?: string;
}

export function SearchBookResultRow(props: SearchBookResultRowProps) {
  const origins = () =>
    props.book.mergedOriginNames.length > 0
      ? props.book.mergedOriginNames
      : props.book.originName
        ? [props.book.originName]
        : [];

  return (
    <li
      class={cn(
        'flex gap-3 border-b border-border/50 px-4 py-3 hover:bg-muted/40 transition-colors',
        props.class,
      )}
    >
      <button
        type="button"
        class="shrink-0 overflow-hidden rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => props.onOpen()}
        aria-label={`查看 ${props.book.name}`}
      >
        <BookCoverImg
          bookUrl={props.book.bookUrl}
          coverUrl={props.book.coverUrl}
          name={props.book.name}
          class="h-16 w-11 object-cover"
        />
      </button>
      <div class="min-w-0 flex-1">
        <button type="button" class="text-left w-full" onClick={() => props.onOpen()}>
          <p class="font-medium leading-snug line-clamp-2">{props.book.name}</p>
          <p class="mt-0.5 text-xs text-muted-foreground truncate">
            {props.book.author || '未知作者'}
          </p>
        </button>
        <Show when={props.book.latestChapterTitle}>
          <p class="mt-1 text-xs text-muted-foreground line-clamp-1">
            {props.book.latestChapterTitle}
          </p>
        </Show>
        <div class="mt-1.5 flex flex-wrap gap-1">
          <For each={origins().slice(0, 3)}>
            {(name) => (
              <Badge variant="outline" class="text-[10px] px-1.5 py-0 font-normal">
                {name}
              </Badge>
            )}
          </For>
          <Show when={origins().length > 3}>
            <Badge variant="outline" class="text-[10px] px-1.5 py-0 font-normal">
              +{origins().length - 3}
            </Badge>
          </Show>
          <Show when={props.onShelf}>
            <Badge variant="secondary" class="text-[10px] px-1.5 py-0">
              已在书架
            </Badge>
          </Show>
        </div>
      </div>
      <div class="flex shrink-0 flex-col items-end justify-center gap-1">
        <Button variant="ghost" size="sm" class="h-8" onClick={() => props.onOpen()}>
          详情
        </Button>
        <Show when={!props.onShelf && props.onAddToShelf}>
          <Button
            variant="outline"
            size="sm"
            class="h-8"
            disabled={props.adding}
            onClick={() => props.onAddToShelf?.()}
          >
            {props.adding ? '添加中…' : '加入书架'}
          </Button>
        </Show>
      </div>
    </li>
  );
}
