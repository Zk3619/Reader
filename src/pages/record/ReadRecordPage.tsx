/**
 * 阅读记录页（对齐 legado ReadRecord：概览统计 + 最近在读 / 时长排行）
 */

import { createMemo, createResource, onCleanup, onMount, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import {
  ReadRecordListsSection,
  useReadRecordRankEntries,
} from '@/components/record/ReadRecordListsSection';
import { ReadRecordArchiveSection } from '@/components/record/ReadRecordArchiveSection';
import { ReadRecordSummaryCard } from '@/components/record/ReadRecordSummaryCard';
import * as readRecordsDb from '@/lib/database/read-records';
import {
  formatReadDuration,
  formatRelativeLastRead,
} from '@/lib/record/read-record-format';
import {
  computeReadRecordStats,
  loadReadRecordEntries,
  type ReadRecordEntry,
} from '@/lib/record/read-record-presenter';
import { READ_RECORD_ARCHIVE_LIST_HEIGHT_PX, READ_RECORD_SECTION_CARD_CLASS } from '@/lib/record/read-record-layout';
import { cn } from '@/lib/utils';
import type { Book } from '@/types';

export interface ReadRecordPageProps {
  onOpenBook?: (book: Book) => void;
  onSearchBook?: (bookName: string) => void;
}

function RecordStatCard(props: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      class={cn(
        'rounded-xl border px-4 py-3',
        props.highlight
          ? 'border-primary/20 bg-primary/8'
          : 'border-border/50 bg-card',
      )}
    >
      <div class="text-xs text-muted-foreground">{props.label}</div>
      <div
        class={cn(
          'mt-1 text-lg font-semibold tabular-nums',
          props.highlight ? 'text-primary' : 'text-foreground',
        )}
      >
        {props.value}
      </div>
    </div>
  );
}

export function ReadRecordPage(props: ReadRecordPageProps) {
  const [entries, { refetch }] = createResource(() => loadReadRecordEntries());

  onMount(() => {
    const refresh = () => void refetch();
    window.addEventListener('read-record-updated', refresh);
    window.addEventListener('bookshelf-book-updated', refresh);
    onCleanup(() => {
      window.removeEventListener('read-record-updated', refresh);
      window.removeEventListener('bookshelf-book-updated', refresh);
    });
  });

  const recentEntries = createMemo(() => entries() ?? []);
  const rankEntries = useReadRecordRankEntries(entries);
  const stats = createMemo(() => computeReadRecordStats(entries() ?? []));
  const hasDurationRecords = createMemo(() =>
    (entries() ?? []).some((e) => e.hasDurationRecord),
  );

  async function handleDelete(entry: ReadRecordEntry) {
    if (!entry.hasDurationRecord) return;
    await readRecordsDb.deleteReadRecord(
      entry.deviceId,
      entry.bookName,
      entry.bookAuthor,
    );
    window.dispatchEvent(new CustomEvent('read-record-updated'));
    void refetch();
  }

  async function handleClearAll() {
    if (!confirm('确定清空全部阅读时长记录？书架阅读进度将保留。')) return;
    await readRecordsDb.clearAllReadRecords();
    window.dispatchEvent(new CustomEvent('read-record-updated'));
    void refetch();
  }

  return (
    <div
      class="flex min-h-0 flex-col gap-6"
      style={{
        '--read-record-archive-list-height': `${READ_RECORD_ARCHIVE_LIST_HEIGHT_PX}px`,
      }}
    >
      <Show when={entries.loading}>
        <p class="text-sm text-muted-foreground">加载中…</p>
      </Show>

      <Show when={!entries.loading && recentEntries().length > 0}>
        <section class={cn(READ_RECORD_SECTION_CARD_CLASS, 'space-y-4')}>
          <div class="flex items-center justify-between gap-2">
            <div class="space-y-1">
              <h3 class="font-semibold text-foreground">阅读概览</h3>
              <p class="text-sm text-muted-foreground">累计阅读时长与在读书籍统计</p>
            </div>
            <Show when={hasDurationRecords()}>
              <Button variant="ghost" size="sm" class="text-destructive" onClick={handleClearAll}>
                清空时长
              </Button>
            </Show>
          </div>
          <ReadRecordSummaryCard
            totalSeconds={stats().totalSeconds}
            bookCount={stats().bookCount}
            recentEntries={recentEntries}
          />
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <RecordStatCard
              label="累计阅读"
              value={formatReadDuration(stats().totalSeconds)}
              highlight
            />
            <RecordStatCard
              label="在读书籍"
              value={`${stats().bookCount} 本`}
            />
            <RecordStatCard
              label="最近阅读"
              value={(() => {
                const latest = stats().latestLastRead;
                return latest != null ? formatRelativeLastRead(latest) : '--';
              })()}
            />
          </div>
        </section>
      </Show>

      <Show
        when={!entries.loading}
        fallback={null}
      >
        <ReadRecordListsSection
          recentEntries={recentEntries}
          rankEntries={rankEntries}
          onOpenBook={props.onOpenBook}
          onSearchBook={props.onSearchBook}
          onDelete={(entry) => void handleDelete(entry)}
        />

        <ReadRecordArchiveSection
          entries={recentEntries}
          onOpenBook={props.onOpenBook}
          onSearchBook={props.onSearchBook}
        />
      </Show>
    </div>
  );
}
