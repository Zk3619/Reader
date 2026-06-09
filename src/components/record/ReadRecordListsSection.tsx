/**
 * 阅读记录页：最近在读 / 阅读时长排行虚拟列表
 */

import { createMemo, Show, type Accessor, type JSX } from 'solid-js';
import { Button } from '@/components/ui/button';
import { BookCoverFromBook } from '@/components/books/BookCoverFromBook';
import { BookCoverFallback } from '@/components/books/BookCoverFallback';
import { CrownIcon } from '@/components/shared/icons';
import { ReadRecordEntryRowMenu } from '@/components/record/ReadRecordEntryRowMenu';
import { VirtualList } from '@/components/shared/virtual-list';
import {
  READ_RECORD_PREVIEW_LIST_HEIGHT_CLASS,
  READ_RECORD_ROW_HEIGHT_PX,
  READ_RECORD_SECTION_CARD_CLASS,
  READ_RECORD_VIRTUAL_LIST_CLASS,
  READ_RECORD_VIRTUAL_LIST_ITEM_CLASS,
  readRecordEntryKey,
} from '@/lib/record/read-record-layout';
import {
  formatReadDuration,
  formatRelativeLastRead,
} from '@/lib/record/read-record-format';
import type { ReadRecordEntry } from '@/lib/record/read-record-presenter';
import {
  bookshelfListCoverClass,
  bookshelfListMainClass,
  bookshelfRowSubtitleClass,
  bookshelfRowTitleClass,
  readRecordListRowClass,
  readRecordRowOpenButtonClass,
} from '@/lib/bookshelf/book-group-card-styles';
import { cn } from '@/lib/utils';
import type { Book } from '@/types';

function ReadRecordRowCover(props: { entry: ReadRecordEntry; alt: string }) {
  return (
    <div class={bookshelfListCoverClass('rounded-lg')} role="presentation">
      <BookCoverFromBook
        book={props.entry.book}
        bookUrl={props.entry.book?.bookUrl}
        coverUrl={props.entry.book?.coverUrl}
        customCoverUrl={props.entry.book?.customCoverUrl}
        alt={props.alt}
        class="h-full w-full object-cover"
        draggable={false}
        fallback={<BookCoverFallback class="h-8 w-8" />}
      />
    </div>
  );
}

function ReadRecordRecentRow(props: {
  entry: ReadRecordEntry;
  onOpenBook?: (book: Book) => void;
  onSearchBook?: (bookName: string) => void;
  onOpenBookInfo?: (book: Book) => void;
  onDelete: () => void;
}) {
  const entry = () => props.entry;
  const handleOpen = () => {
    const book = entry().book;
    if (book) props.onOpenBook?.(book);
    else props.onSearchBook?.(entry().bookName);
  };

  return (
    <div
      class={cn(
        readRecordListRowClass(),
        'group',
        entry().missingFromShelf && 'opacity-80',
      )}
    >
      <Button
        type="button"
        variant="ghost"
        class={readRecordRowOpenButtonClass('items-stretch')}
        onClick={handleOpen}
      >
        <ReadRecordRowCover entry={entry()} alt={entry().bookName} />
        <div class={bookshelfListMainClass()}>
          <div class={bookshelfRowTitleClass(false, 'text-sm')}>{entry().bookName}</div>
          <Show when={entry().bookAuthor}>
            <div class={bookshelfRowSubtitleClass(true)}>{entry().bookAuthor}</div>
          </Show>
          <div class="flex min-w-0 items-center gap-1.5 text-xs leading-tight text-muted-foreground">
            <Show when={entry().durChapterTitle}>
              <span class="min-w-0 truncate">{entry().durChapterTitle}</span>
              <span aria-hidden="true">·</span>
            </Show>
            <span class="shrink-0">{formatRelativeLastRead(entry().lastRead)}</span>
          </div>
          <div class="text-xs leading-tight font-medium text-primary/90">
            <Show
              when={entry().hasDurationRecord && entry().readTime > 0}
              fallback={<span class="text-muted-foreground">暂无时长统计</span>}
            >
              累计 {formatReadDuration(entry().readTime)}
            </Show>
          </div>
        </div>
      </Button>
      <ReadRecordEntryRowMenu
        entry={entry()}
        onOpenBook={props.onOpenBook}
        onSearchBook={props.onSearchBook}
        onOpenBookInfo={props.onOpenBookInfo}
        onDelete={props.onDelete}
      />
    </div>
  );
}

function readRecordRankBadgeClass(rank: number): string {
  if (rank === 1) {
    return cn(
      'bg-amber-100 text-amber-800 ring-1 ring-amber-400/50',
      'dark:bg-amber-500/20 dark:text-amber-300 dark:ring-amber-400/40',
    );
  }
  if (rank === 2) {
    return cn(
      'bg-slate-200 text-slate-700 ring-1 ring-slate-300/80',
      'dark:bg-slate-400/20 dark:text-slate-200 dark:ring-slate-400/50',
    );
  }
  if (rank === 3) {
    return cn(
      'bg-orange-100 text-orange-900 ring-1 ring-orange-400/50',
      'dark:bg-orange-600/20 dark:text-orange-300 dark:ring-orange-500/40',
    );
  }
  return 'bg-muted text-muted-foreground';
}

function ReadRecordRankBadge(props: { rank: number }) {
  return (
    <div class="flex w-9 shrink-0 flex-col items-center justify-center gap-0.5 self-stretch">
      <div class="flex h-3.5 w-full items-end justify-center">
        <Show when={props.rank === 1}>
          <CrownIcon
            class="text-amber-500 dark:text-amber-400"
            size={14}
          />
        </Show>
      </div>
      <span
        class={cn(
          'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
          readRecordRankBadgeClass(props.rank),
        )}
      >
        {props.rank}
      </span>
    </div>
  );
}

function ReadRecordRankRow(props: {
  entry: ReadRecordEntry;
  rank: number;
  onOpenBook?: (book: Book) => void;
  onSearchBook?: (bookName: string) => void;
  onOpenBookInfo?: (book: Book) => void;
  onDelete: () => void;
}) {
  const entry = () => props.entry;
  const handleOpen = () => {
    const book = entry().book;
    if (book) props.onOpenBook?.(book);
    else props.onSearchBook?.(entry().bookName);
  };

  return (
    <div
      class={cn(
        readRecordListRowClass(),
        'group',
        entry().missingFromShelf && 'opacity-80',
      )}
    >
      <Button
        type="button"
        variant="ghost"
        class={readRecordRowOpenButtonClass('items-stretch')}
        onClick={handleOpen}
      >
        <ReadRecordRankBadge rank={props.rank} />
        <ReadRecordRowCover entry={entry()} alt={entry().bookName} />
        <div class={bookshelfListMainClass()}>
          <div class={bookshelfRowTitleClass(false, 'text-sm')}>{entry().bookName}</div>
          <Show when={entry().bookAuthor}>
            <div class={bookshelfRowSubtitleClass(true)}>{entry().bookAuthor}</div>
          </Show>
          <div class="text-xs leading-tight font-medium text-primary/90">
            {formatReadDuration(entry().readTime)}
          </div>
        </div>
      </Button>
      <ReadRecordEntryRowMenu
        entry={entry()}
        onOpenBook={props.onOpenBook}
        onSearchBook={props.onSearchBook}
        onOpenBookInfo={props.onOpenBookInfo}
        onDelete={props.onDelete}
      />
    </div>
  );
}

function ReadRecordVirtualPanel(props: {
  title: string;
  description?: string;
  emptyText: string;
  items: Accessor<readonly ReadRecordEntry[]>;
  children: (entry: ReadRecordEntry, index: number) => JSX.Element;
}) {
  return (
    <section
      class={cn(
        READ_RECORD_SECTION_CARD_CLASS,
        'flex min-w-0 flex-1 flex-col gap-4',
      )}
    >
      <div class="shrink-0 space-y-1">
        <h3 class="font-semibold text-foreground">{props.title}</h3>
        <Show when={props.description}>
          <p class="text-sm text-muted-foreground">{props.description}</p>
        </Show>
      </div>
      <Show
        when={props.items().length > 0}
        fallback={
          <div
            class={cn(
              READ_RECORD_PREVIEW_LIST_HEIGHT_CLASS,
              'flex flex-none items-center justify-center overflow-hidden rounded-xl border border-dashed border-border/60 bg-muted/20 p-6 text-center text-sm text-muted-foreground',
            )}
          >
            {props.emptyText}
          </div>
        }
      >
        <div class={cn('flex-none min-h-0', READ_RECORD_PREVIEW_LIST_HEIGHT_CLASS)}>
          <VirtualList
            class={READ_RECORD_VIRTUAL_LIST_CLASS}
            items={props.items}
            estimateSize={() => READ_RECORD_ROW_HEIGHT_PX}
            overscan={2}
            getItemKey={(entry) => readRecordEntryKey(entry.bookName, entry.bookAuthor)}
          >
            {(entry, index) => (
              <div class={cn(READ_RECORD_VIRTUAL_LIST_ITEM_CLASS, 'pb-2')}>
                {props.children(entry, index)}
              </div>
            )}
          </VirtualList>
        </div>
      </Show>
    </section>
  );
}

export interface ReadRecordListsSectionProps {
  recentEntries: Accessor<readonly ReadRecordEntry[]>;
  rankEntries: Accessor<readonly ReadRecordEntry[]>;
  onOpenBook?: (book: Book) => void;
  onSearchBook?: (bookName: string) => void;
  onOpenBookInfo?: (book: Book) => void;
  onDelete: (entry: ReadRecordEntry) => void;
}

export function ReadRecordListsSection(props: ReadRecordListsSectionProps) {
  return (
    <div class="flex flex-col gap-4 md:flex-row md:items-start">
      <ReadRecordVirtualPanel
        title="最近在读"
        description="按最近阅读时间排序，点击继续阅读"
        emptyText="暂无阅读记录"
        items={props.recentEntries}
      >
        {(entry) => (
          <ReadRecordRecentRow
            entry={entry}
            onOpenBook={props.onOpenBook}
            onSearchBook={props.onSearchBook}
            onOpenBookInfo={props.onOpenBookInfo}
            onDelete={() => props.onDelete(entry)}
          />
        )}
      </ReadRecordVirtualPanel>

      <ReadRecordVirtualPanel
        title="阅读时长排行"
        description="按累计阅读时长排序"
        emptyText="暂无阅读时长统计"
        items={props.rankEntries}
      >
        {(entry, index) => (
          <ReadRecordRankRow
            entry={entry}
            rank={index + 1}
            onOpenBook={props.onOpenBook}
            onSearchBook={props.onSearchBook}
            onOpenBookInfo={props.onOpenBookInfo}
            onDelete={() => props.onDelete(entry)}
          />
        )}
      </ReadRecordVirtualPanel>
    </div>
  );
}

export function useReadRecordRankEntries(
  entries: Accessor<readonly ReadRecordEntry[] | undefined>,
) {
  return createMemo(() =>
    [...(entries() ?? [])]
      .filter((e) => e.hasDurationRecord && e.readTime > 0)
      .sort((a, b) => b.readTime - a.readTime),
  );
}
