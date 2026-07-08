/**
 * 阅读记录归档区：按时间 / 日期 / 时长切换展示完整记录
 */

import { createSignal, Match, Show, Switch, type Accessor } from 'solid-js';
import { useChunkedDerived } from '@/lib/hooks/useChunkedDerived';
import { Button } from '@/components/ui/button';
import { BookCoverFromBook } from '@/components/books/BookCoverFromBook';
import { BookCoverFallback } from '@/components/books/BookCoverFallback';
import { ReadRecordEntryRowMenu } from '@/components/record/ReadRecordEntryRowMenu';
import { AppTabs } from '@/components/shared/AppTabs';
import { VirtualList } from '@/components/shared/virtual-list';
import {
  buildReadRecordArchiveRows,
  loadReadRecordArchiveMode,
  READ_RECORD_ARCHIVE_MODE_HINTS,
  READ_RECORD_ARCHIVE_MODE_LABELS,
  saveReadRecordArchiveMode,
  type ReadRecordArchiveMode,
  type ReadRecordArchiveVirtualRow,
} from '@/lib/record/read-record-archive';
import {
  formatDateTime,
  formatFriendlyDate,
  formatReadDuration,
  formatRelativeLastRead,
} from '@/lib/record/read-record-format';
import {
  READ_RECORD_ARCHIVE_LIST_HEIGHT_CLASS,
  READ_RECORD_DATE_HEADER_HEIGHT_PX,
  READ_RECORD_ROW_HEIGHT_PX,
  READ_RECORD_VIRTUAL_LIST_CLASS,
} from '@/lib/record/read-record-layout';
import { ThemedRecordSectionCard } from '@/components/theme/ThemedRecordSectionCard';
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

const ARCHIVE_MODES: ReadRecordArchiveMode[] = ['latest', 'aggregate', 'duration'];

function ArchiveRowCover(props: { entry: ReadRecordEntry }) {
  return (
    <div class={bookshelfListCoverClass('rounded-lg')} role="presentation">
      <BookCoverFromBook
        book={props.entry.book}
        bookUrl={props.entry.book?.bookUrl}
        coverUrl={props.entry.book?.coverUrl}
        customCoverUrl={props.entry.book?.customCoverUrl}
        alt={props.entry.bookName}
        class="h-full w-full object-cover"
        draggable={false}
        fallback={<BookCoverFallback class="h-8 w-8" />}
      />
    </div>
  );
}

function ReadRecordArchiveDateHeader(props: { date: string; totalSeconds: number }) {
  return (
    <div class="flex h-full items-center justify-between gap-3 border-b border-border/40 px-1">
      <span class="text-sm font-semibold text-foreground">
        {formatFriendlyDate(props.date)}
      </span>
      <Show when={props.totalSeconds > 0}>
        <span class="shrink-0 text-xs tabular-nums text-muted-foreground">
          当日 {formatReadDuration(props.totalSeconds)}
        </span>
      </Show>
    </div>
  );
}

function ReadRecordArchiveEntryRow(props: {
  entry: ReadRecordEntry;
  mode: ReadRecordArchiveMode;
  onOpenBook?: (book: Book) => void;
  onSearchBook?: (bookName: string) => void;
  onOpenBookInfo?: (book: Book) => void;
  onDelete?: () => void;
}) {
  const entry = () => props.entry;
  const handleOpen = () => {
    const book = entry().book;
    if (book) props.onOpenBook?.(book);
    else props.onSearchBook?.(entry().bookName);
  };

  const trailingMeta = () => {
    if (props.mode === 'duration') {
      return entry().hasDurationRecord && entry().readTime > 0
        ? formatReadDuration(entry().readTime)
        : '暂无时长';
    }
    if (props.mode === 'latest') {
      return formatRelativeLastRead(entry().lastRead) || formatDateTime(entry().lastRead);
    }
    const duration =
      entry().hasDurationRecord && entry().readTime > 0
        ? formatReadDuration(entry().readTime)
        : null;
    const time = formatDateTime(entry().lastRead);
    return duration ? `${duration} · ${time}` : time;
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
        <ArchiveRowCover entry={entry()} />
        <div class={bookshelfListMainClass()}>
          <div class={bookshelfRowTitleClass(false, 'text-sm')}>{entry().bookName}</div>
          <Show when={entry().bookAuthor}>
            <div class={bookshelfRowSubtitleClass(true)}>{entry().bookAuthor}</div>
          </Show>
          <Show when={entry().durChapterTitle}>
            <div class="truncate text-xs leading-tight text-muted-foreground">
              {entry().durChapterTitle}
            </div>
          </Show>
          <div class="text-xs leading-tight font-medium text-primary/90">{trailingMeta()}</div>
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

export interface ReadRecordArchiveSectionProps {
  entries: Accessor<readonly ReadRecordEntry[]>;
  onOpenBook?: (book: Book) => void;
  onSearchBook?: (bookName: string) => void;
  onOpenBookInfo?: (book: Book) => void;
  onDelete?: (entry: ReadRecordEntry) => void;
}

export function ReadRecordArchiveSection(props: ReadRecordArchiveSectionProps) {
  const [mode, setMode] = createSignal<ReadRecordArchiveMode>(loadReadRecordArchiveMode());

  const { value: rows, computing, progressText } = useChunkedDerived({
    deps: () => ({ entries: props.entries(), mode: mode() }),
    compute: () => buildReadRecordArchiveRows(props.entries(), mode()),
    progressLabel: '正在整理阅读记录',
  });

  const safeRows = (): readonly ReadRecordArchiveVirtualRow[] => rows() ?? [];

  function handleModeChange(next: string) {
    const value = next as ReadRecordArchiveMode;
    setMode(value);
    saveReadRecordArchiveMode(value);
  }

  const estimateRowSize = (index: number) => {
    const row = safeRows()[index];
    if (!row) return READ_RECORD_ROW_HEIGHT_PX;
    return row.kind === 'date-header'
      ? READ_RECORD_DATE_HEADER_HEIGHT_PX
      : READ_RECORD_ROW_HEIGHT_PX;
  };

  return (
    <ThemedRecordSectionCard class="space-y-4">
      <div class="space-y-1">
        <h3 class="font-semibold text-foreground">全部阅读记录</h3>
        <p class="text-sm text-muted-foreground">{READ_RECORD_ARCHIVE_MODE_HINTS[mode()]}</p>
      </div>

      <AppTabs
        layout="stacked"
        variant="settings-equal"
        value={mode()}
        options={ARCHIVE_MODES}
        labels={READ_RECORD_ARCHIVE_MODE_LABELS}
        ariaLabel="阅读记录展示方式"
        onChange={handleModeChange}
      />

      <div class="mt-4 space-y-3">
        <Show when={computing() && progressText()}>
          <p class="text-center text-xs text-muted-foreground">{progressText()}</p>
        </Show>
        <Show
          when={safeRows().length > 0 || computing()}
          fallback={
            <div
              class={cn(
                READ_RECORD_ARCHIVE_LIST_HEIGHT_CLASS,
                'flex flex-none items-center justify-center overflow-hidden rounded-xl border border-dashed border-border/60 bg-muted/20 p-8 text-center text-sm text-muted-foreground',
              )}
            >
              {mode() === 'duration' ? '暂无阅读时长统计' : '暂无阅读记录'}
            </div>
          }
        >
          <div class={cn('flex-none min-h-0', READ_RECORD_ARCHIVE_LIST_HEIGHT_CLASS)}>
            <VirtualList
              class={READ_RECORD_VIRTUAL_LIST_CLASS}
              items={safeRows}
              estimateSize={estimateRowSize}
              overscan={6}
              getItemKey={(row: ReadRecordArchiveVirtualRow) => row.key}
            >
            {(row) => (
              <div
                class={cn(
                  'box-border h-full pr-1',
                  row.kind === 'entry' && 'pb-2',
                )}
              >
                <Switch>
                  <Match when={row.kind === 'date-header' && row}>
                    {(headerRow) => (
                      <ReadRecordArchiveDateHeader
                        date={headerRow().date}
                        totalSeconds={headerRow().totalSeconds}
                      />
                    )}
                  </Match>
                  <Match when={row.kind === 'entry' && row}>
                    {(entryRow) => (
                      <ReadRecordArchiveEntryRow
                        entry={entryRow().entry}
                        mode={mode()}
                        onOpenBook={props.onOpenBook}
                        onSearchBook={props.onSearchBook}
                        onOpenBookInfo={props.onOpenBookInfo}
                        onDelete={
                          props.onDelete
                            ? () => props.onDelete!(entryRow().entry)
                            : undefined
                        }
                      />
                    )}
                  </Match>
                </Switch>
              </div>
            )}
          </VirtualList>
          </div>
        </Show>
      </div>
    </ThemedRecordSectionCard>
  );
}
