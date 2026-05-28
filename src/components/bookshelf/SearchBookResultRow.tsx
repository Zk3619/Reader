import { For, Show } from 'solid-js';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BookCoverImg } from '@/components/books/BookCoverImg';
import { BookCoverIcon } from '@/components/shared/icons';
import type { MergedSearchBook } from '@/lib/book-source/multi-source-search';
import { cn } from '@/lib/utils';
import {
  exploreBookListBadgeClass,
  exploreBookListBadgeLastClass,
  exploreBookListBadgeRowClass,
  exploreBookListBodyClass,
  exploreBookListCardClass,
  exploreBookListCoverClass,
} from '@/lib/bookshelf/book-group-card-styles';
import { ExploreBookListIntro } from '@/pages/explore/ExploreBookListIntro';
import { tryFormatDisplayUpdateTime } from '@/lib/format/display-time';
import {
  buildBadgeTooltipText,
  buildSearchResultBadgeEntries,
  BOOK_BADGE_TOOLTIP_CONTENT_CLASS,
} from '@/lib/bookshelf/book-badge-utils';

export interface SearchBookResultRowProps {
  book: MergedSearchBook;
  onShelf: boolean;
  onOpen: () => void;
  class?: string;
  source?: import('@/types').BookSource | null;
}

export function SearchBookResultRow(props: SearchBookResultRowProps) {
  const badgeEntries = () => buildSearchResultBadgeEntries(props.book, props.onShelf);
  const badgeTooltipText = () => buildBadgeTooltipText(badgeEntries());
  const latestChapterText = () => props.book.latestChapterTitle?.trim() || '无最新章节';

  return (
    <li class={cn('w-full px-1 py-1', props.class)}>
      <div class={exploreBookListCardClass('cursor-default')}>
        <button
          type="button"
          class={exploreBookListCoverClass(
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          onClick={() => props.onOpen()}
          aria-label={`查看 ${props.book.name}`}
        >
          <BookCoverImg
            bookUrl={props.book.bookUrl}
            src={props.book.coverUrl}
            referer={props.book.origin}
            source={props.source ?? null}
            class="h-full w-full object-cover"
            fallback={
              <div class="flex h-full w-full items-center justify-center">
                <BookCoverIcon class="h-8 w-8 text-muted-foreground" size={32} />
              </div>
            }
          />
        </button>
        <div class={exploreBookListBodyClass()}>
          <button type="button" class="text-left" onClick={() => props.onOpen()}>
            <p class="m-0 shrink-0 truncate font-medium leading-5 text-foreground">{props.book.name}</p>
          </button>
          <p class="m-0 shrink-0 truncate text-xs leading-5 text-muted-foreground">
            作者：{props.book.author || '—'}
          </p>
          <p class="m-0 shrink-0 truncate text-xs leading-5 text-muted-foreground">
            最新章节：{latestChapterText()}
            <Show when={tryFormatDisplayUpdateTime(props.book.latestChapterUpdateTime)}>
              {(label) => <span> · {label()}</span>}
            </Show>
          </p>
          <Show when={badgeEntries().length > 0}>
            <Tooltip>
              <TooltipTrigger as="div" class={exploreBookListBadgeRowClass()}>
                <For each={badgeEntries()}>
                  {(entry, i) => (
                    <Badge
                      variant={entry.variant}
                      class={
                        i() === badgeEntries().length - 1
                          ? exploreBookListBadgeLastClass()
                          : exploreBookListBadgeClass()
                      }
                    >
                      <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                        {entry.value}
                      </span>
                    </Badge>
                  )}
                </For>
              </TooltipTrigger>
              <TooltipContent class={BOOK_BADGE_TOOLTIP_CONTENT_CLASS}>
                {badgeTooltipText()}
              </TooltipContent>
            </Tooltip>
          </Show>
          <ExploreBookListIntro>
            简介：{props.book.intro?.trim() || '暂无简介'}
          </ExploreBookListIntro>
        </div>
      </div>
    </li>
  );
}
