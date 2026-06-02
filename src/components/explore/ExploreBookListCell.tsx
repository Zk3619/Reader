/**
 * 探索/搜索列表单元：模块级组件 + 稳定 bookUrl，避免 Show 回调子节点导致 BookCoverImg remount。
 */

import { For, Show, type Accessor } from 'solid-js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BookCoverImg } from '@/components/books/BookCoverImg';
import { BookCoverIcon } from '@/components/shared/icons';
import type { BookSource, SearchBook } from '@/types';
import { Badge } from '@/components/ui/badge';
import { explorePageLayoutStore } from '@/stores/explore-page-layout';
import {
  bookshelfCompactListCardClass,
  bookshelfCompactCoverClass,
  bookshelfListCardClass,
  bookshelfListCoverClass,
  exploreBookListBadgeClass,
  exploreBookListBadgeLastClass,
  exploreBookListBadgeRowClass,
  exploreBookListBodyClass,
  exploreBookListCardClass,
  exploreBookListCoverClass,
} from '@/lib/bookshelf/book-group-card-styles';
import { getExploreCardLayout } from '@/lib/explore/explore-list-layout';
import { ExploreBookListIntro } from '@/components/explore/ExploreBookListIntro';
import { bookGroupCardPressHandlers } from '@/lib/bookshelf/book-group-card-press';
import { tryFormatDisplayUpdateTime } from '@/lib/format/display-time';
import {
  buildBadgeTooltipText,
  buildExploreBadgeEntries,
  BOOK_BADGE_TOOLTIP_CONTENT_CLASS,
} from '@/lib/bookshelf/book-badge-utils';

function normalizePlaceholder(v: string | undefined): string {
  if (v == null) return '--';
  const s = String(v).trim();
  if (s === '' || /^[\s·•\-\u00B7\u2022]*$/.test(s)) return '--';
  return s;
}

function displayChapterTitle(title: string | undefined): string {
  const cleaned = title?.trim().replace(/\s*[•·]\s*$/, '').trim();
  return normalizePlaceholder(cleaned);
}

function ExploreBookBadgeRow(props: { book: Accessor<SearchBook> }) {
  const entries = () => buildExploreBadgeEntries(props.book());
  const tooltipText = () => buildBadgeTooltipText(entries());

  return (
    <Show when={entries().length > 0}>
      <Tooltip>
        <TooltipTrigger as="div" class={exploreBookListBadgeRowClass()}>
          <For each={entries()}>
            {(entry, i) => {
              const isLast = i() === entries().length - 1;
              return (
                <Badge
                  variant={entry.variant}
                  class={isLast ? exploreBookListBadgeLastClass() : exploreBookListBadgeClass()}
                >
                  <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                    {entry.value}
                  </span>
                </Badge>
              );
            }}
          </For>
        </TooltipTrigger>
        <TooltipContent class={BOOK_BADGE_TOOLTIP_CONTENT_CLASS}>
          {tooltipText()}
        </TooltipContent>
      </Tooltip>
    </Show>
  );
}

function ExploreBookListCellContent(props: {
  book: Accessor<SearchBook>;
  bookUrl: string;
  booksByUrl: Record<string, SearchBook>;
  source: BookSource;
  onOpen: (book: SearchBook) => void;
  onCoverUrlRefreshed: (bookUrl: string, url: string) => void;
}) {
  const sb = props.book;
  const bookUrl = () => sb().bookUrl;
  const coverUrl = () => props.booksByUrl[props.bookUrl]?.coverUrl;
  const origin = () => props.booksByUrl[props.bookUrl]?.origin;
  const settings = () => explorePageLayoutStore.settings;
  const compactDisplay = () => settings().dataDisplayMode === 'compact';
  const showCover = () => settings().showCover;
  const cardLayout = () => getExploreCardLayout(settings());
  const useBookshelfCard = () =>
    settings().dataLayoutMode === 'card-list' && cardLayout() !== 'text';

  const cardClass = () => {
    if (!useBookshelfCard()) return exploreBookListCardClass();
    return cardLayout() === 'compact'
      ? bookshelfCompactListCardClass()
      : bookshelfListCardClass();
  };

  const coverClass = () => {
    if (!useBookshelfCard()) return exploreBookListCoverClass();
    return cardLayout() === 'compact'
      ? bookshelfCompactCoverClass()
      : bookshelfListCoverClass('rounded-lg');
  };

  return (
    <li class="w-full list-none">
      <button
        type="button"
        class={cardClass()}
        onClick={() => props.onOpen(sb())}
        {...bookGroupCardPressHandlers}
      >
        <Show when={showCover()}>
          <div class={coverClass()}>
            <BookCoverImg
              src={coverUrl()}
              referer={origin()}
              source={props.source}
              bookUrl={bookUrl()}
              onCoverUrlRefreshed={(url) => props.onCoverUrlRefreshed(bookUrl(), url)}
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
        <div class={exploreBookListBodyClass('text-left')}>
          <p class="m-0 shrink-0 truncate font-medium leading-5 text-foreground">
            {sb().name}
          </p>
          <Show when={!compactDisplay()}>
            <p class="m-0 shrink-0 truncate text-xs leading-5 text-muted-foreground">
              作者：{sb().author || '—'}
              <Show when={sb().chapterWordCountText ?? sb().wordCount}>
                <span class="ml-1">· {sb().chapterWordCountText ?? sb().wordCount}</span>
              </Show>
            </p>
            <p class="m-0 shrink-0 truncate text-xs leading-5 text-muted-foreground">
              {(() => {
                const updateLabel = tryFormatDisplayUpdateTime(sb().latestChapterUpdateTime);
                return (
                  <>
                    最新章节：{displayChapterTitle(sb().latestChapterTitle)}
                    <Show when={updateLabel}>
                      <span> · {updateLabel}</span>
                    </Show>
                  </>
                );
              })()}
            </p>
            <ExploreBookBadgeRow book={sb} />
            <ExploreBookListIntro>
              简介：{sb().intro?.trim() || '暂无简介'}
            </ExploreBookListIntro>
          </Show>
        </div>
      </button>
    </li>
  );
}

export interface ExploreBookListCellProps {
  bookUrl: string;
  /** solid-js/store 代理：按 bookUrl 细粒度订阅，勿用 createMemo(() => new Map(...)) */
  booksByUrl: Record<string, SearchBook>;
  source: BookSource;
  onOpen: (book: SearchBook) => void;
  onCoverUrlRefreshed: (bookUrl: string, url: string) => void;
}

export function ExploreBookListCell(props: ExploreBookListCellProps) {
  const book = () => props.booksByUrl[props.bookUrl];

  return (
    <Show when={book()}>
      <ExploreBookListCellContent
        book={book as Accessor<SearchBook>}
        bookUrl={props.bookUrl}
        booksByUrl={props.booksByUrl}
        source={props.source}
        onOpen={props.onOpen}
        onCoverUrlRefreshed={props.onCoverUrlRefreshed}
      />
    </Show>
  );
}
