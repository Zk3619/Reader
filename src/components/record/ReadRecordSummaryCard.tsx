/**
 * 阅读概览成就卡：对齐 legados-main SummaryCard（累计统计 + 封面叠放）
 */

import { For, Show, type Accessor } from 'solid-js';
import { BookCoverFromBook } from '@/components/books/BookCoverFromBook';
import { BookCoverFallback } from '@/components/books/BookCoverFallback';
import { formatReadDuration } from '@/lib/record/read-record-format';
import type { ReadRecordEntry } from '@/lib/record/read-record-presenter';

const STACK_ROTATIONS = [-8, 0, 8] as const;

function BookStackCover(props: { entry: ReadRecordEntry; index: number }) {
  return (
    <div
      class="absolute bottom-0 left-1/2 h-20 w-14 overflow-hidden rounded-md border border-border/50 bg-muted shadow-sm"
      style={{
        transform: `translateX(calc(-50% + ${props.index === 0 ? -12 : props.index === 2 ? 12 : 0}px)) rotate(${STACK_ROTATIONS[props.index] ?? 0}deg)`,
        'z-index': String(props.index + 1),
      }}
    >
      <BookCoverFromBook
        book={props.entry.book}
        bookUrl={props.entry.book?.bookUrl}
        coverUrl={props.entry.book?.coverUrl}
        customCoverUrl={props.entry.book?.customCoverUrl}
        alt={props.entry.bookName}
        class="h-full w-full object-cover"
        draggable={false}
        fallback={<BookCoverFallback class="h-6 w-6" />}
      />
    </div>
  );
}

export interface ReadRecordSummaryCardProps {
  totalSeconds: number;
  bookCount: number;
  recentEntries: Accessor<readonly ReadRecordEntry[]>;
}

export function ReadRecordSummaryCard(props: ReadRecordSummaryCardProps) {
  const stackEntries = () => props.recentEntries().slice(0, 3);

  return (
    <div class="flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-muted/15 p-4">
      <div class="min-w-0 flex-1 space-y-1">
        <p class="text-xs font-medium text-muted-foreground">累计阅读成就</p>
        <p class="text-base font-semibold text-foreground">
          已读 {props.bookCount} 本书
        </p>
        <p class="text-sm text-primary">
          共阅读 {formatReadDuration(props.totalSeconds)}
        </p>
      </div>
      <Show when={stackEntries().length > 0}>
        <div class="relative h-24 w-28 shrink-0">
          <For each={stackEntries()}>
            {(entry, index) => <BookStackCover entry={entry} index={index()} />}
          </For>
        </div>
      </Show>
    </div>
  );
}
