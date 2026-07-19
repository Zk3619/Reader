import { For, Show } from 'solid-js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { BookCoverImg } from '@/components/media/reader/books/BookCoverImg';
import { BookCoverIcon } from '@/components/shared/icons';
import type { MergedSearchBook } from '@/lib/book-source/multi-source-search';
import { cn } from '@/lib/utils';
import { bookGroupCardPressHandlers } from '@/lib/bookshelf/book-group-card-press';
import {
  BOOK_GROUP_CARD_BUTTON_BASE,
  exploreBookListBadgeClass,
  exploreBookListBadgeLastClass,
  exploreBookListBadgeRowClass,
  exploreBookListBodyClass,
  exploreBookListCardClass,
  exploreBookListCoverClass,
} from '@/lib/bookshelf/book-group-card-styles';
import { ExploreBookListIntro } from '@/components/media/reader/explore/ExploreBookListIntro';
import { tryFormatDisplayUpdateTime } from '@/lib/format/display-time';
import {
  buildBadgeTooltipText,
  buildSearchResultMetaBadgeEntries,
  BOOK_BADGE_TOOLTIP_CONTENT_CLASS,
  getSearchResultOriginCount,
} from '@/lib/bookshelf/book-badge-utils';

export interface SearchBookResultRowProps {
  book: MergedSearchBook;
  onShelf: boolean;
  onOpen: () => void;
  class?: string;
  source?: import('@/types').BookSource | null;
}

export function SearchBookResultRow(props: SearchBookResultRowProps) {
  const metaBadgeEntries = () => buildSearchResultMetaBadgeEntries(props.book);
  const metaBadgeTooltipText = () => buildBadgeTooltipText(metaBadgeEntries());
  const latestChapterText = () => props.book.latestChapterTitle?.trim() || '无最新章节';
  const originCount = () => getSearchResultOriginCount(props.book);

  return (
    <li class={cn('w-full', props.class)}>
      <Button
        variant="ghost"
        class={cn(BOOK_GROUP_CARD_BUTTON_BASE, exploreBookListCardClass())}
        onClick={() => props.onOpen()}
        aria-label={`查看 ${props.book.name}`}
        {...bookGroupCardPressHandlers}
      >
        <Show when={originCount() > 0}>
          <span
            class="pointer-events-none absolute right-2 top-2 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold leading-none text-primary-foreground shadow-sm"
            aria-label={`${originCount()} 个书源`}
          >
            {originCount()}
          </span>
        </Show>
        <div class={exploreBookListCoverClass()}>
          <BookCoverImg
            bookUrl={props.book.bookUrl}
            src={props.book.coverUrl}
            referer={props.book.origin}
            source={props.source ?? null}
            alt=""
            class="h-full w-full object-cover"
            draggable={false}
            deferLoadUntilVisible
            fallback={
              <div class="flex h-full w-full items-center justify-center">
                <BookCoverIcon class="h-8 w-8 text-muted-foreground" size={32} />
              </div>
            }
          />
        </div>
        <div class={exploreBookListBodyClass('text-left')}>
          <p class="m-0 flex min-w-0 shrink-0 items-center gap-1.5 leading-5">
            <Show when={props.onShelf}>
              <span class="sr-only">已在书架</span>
              <span
                class="size-2 shrink-0 rounded-full bg-green-500 shadow-[0_0_0_1px_rgba(0,0,0,0.08)] dark:bg-green-400"
                aria-hidden
              />
            </Show>
            <span class="min-w-0 truncate font-medium text-foreground">{props.book.name}</span>
          </p>
          <p class="m-0 shrink-0 truncate text-xs leading-5 text-muted-foreground">
            作者：{props.book.author || '—'}
          </p>
          <p class="m-0 shrink-0 truncate text-xs leading-5 text-muted-foreground">
            最新章节：{latestChapterText()}
            <Show when={tryFormatDisplayUpdateTime(props.book.latestChapterUpdateTime)}>
              {(label) => <span> · {label()}</span>}
            </Show>
          </p>
          <Show when={metaBadgeEntries().length > 0}>
            <AppTooltip>
              <AppTooltipTrigger as="div" class={exploreBookListBadgeRowClass()}>
                <For each={metaBadgeEntries()}>
                  {(entry, i) => (
                    <Badge
                      variant={entry.variant}
                      class={
                        i() === metaBadgeEntries().length - 1
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
              </AppTooltipTrigger>
              <AppTooltipContent class={BOOK_BADGE_TOOLTIP_CONTENT_CLASS}>
                {metaBadgeTooltipText()}
              </AppTooltipContent>
            </AppTooltip>
          </Show>
          <ExploreBookListIntro>
            简介：{props.book.intro?.trim() || '暂无简介'}
          </ExploreBookListIntro>
        </div>
      </Button>
    </li>
  );
}
