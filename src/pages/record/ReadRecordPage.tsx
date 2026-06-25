/**
 * 阅读记录页（对齐 legado ReadRecord：概览统计 + 最近在读 / 时长排行）
 */

import { createMemo, createResource, createSignal, onCleanup, onMount, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { ReadRecordCalendarDrawer } from '@/components/record/ReadRecordCalendarDrawer';
import { ReadRecordGoalCard } from '@/components/record/ReadRecordGoalCard';
import { ReadRecordHeatmap } from '@/components/record/ReadRecordHeatmap';
import {
  ReadRecordListsSection,
  useReadRecordRankEntries,
} from '@/components/record/ReadRecordListsSection';
import { ReadRecordArchiveSection } from '@/components/record/ReadRecordArchiveSection';
import { ReadRecordOverviewSection } from '@/components/record/ReadRecordOverviewSection';
import { PageToolbar } from '@/components/shell/PageToolbar';
import { PageToolbarTitleDropdown } from '@/components/shell/PageToolbarTitleDropdown';
import { SettingsToolbarLeading } from '@/components/shell/SettingsPageToolbar';
import {
  AppDropdownMenu,
  AppDropdownMenuCheckboxItem,
  AppDropdownMenuContent,
  AppDropdownMenuIconTrigger,
  AppDropdownMenuItem,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
} from '@/components/shared/AppDropdownMenu';
import { CalendarDaysIcon, MoreIcon, XIcon } from '@/components/shared/icons';
import * as readRecordDetailsDb from '@/lib/database/read-record-details';
import * as readRecordsDb from '@/lib/database/read-records';
import { isMobile } from '@/lib/platform/detect';
import {
  readRecordEntryMatchesDate,
  formatSelectedDateLabel,
  loadDailyReadStats,
} from '@/lib/record/read-record-daily';
import { useChunkedFilter } from '@/lib/hooks/useChunkedFilter';
import { formatDateKey } from '@/lib/record/read-record-format';
import {
  computeReadRecordStats,
  loadReadRecordEntries,
  type ReadRecordEntry,
} from '@/lib/record/read-record-presenter';
import {
  READ_RECORD_ARCHIVE_LIST_HEIGHT_PX,
  READ_RECORD_PREVIEW_LIST_HEIGHT_PX,
} from '@/lib/record/read-record-layout';
import {
  mainShellPageRoot,
  mainShellPageScroll,
  mainShellTabEnterClass,
} from '@/lib/ui/viewport-classes';
import { settingsStore } from '@/stores/settings';
import { cn } from '@/lib/utils';
import type { Book } from '@/types';

export interface ReadRecordPageProps {
  onOpenBook?: (book: Book) => void;
  onSearchBook?: (bookName: string) => void;
  onOpenBookInfo?: (book: Book) => void;
  onBack?: () => void;
}

export function ReadRecordPage(props: ReadRecordPageProps) {
  const [calendarOpen, setCalendarOpen] = createSignal(false);
  const [selectedDate, setSelectedDate] = createSignal<string | null>(null);

  const tabEnterClass = () =>
    mainShellTabEnterClass(settingsStore.state.app.reduceMotion, isMobile());

  const [entries, { refetch }] = createResource(() => loadReadRecordEntries());
  const [dailyStats, { refetch: refetchDaily }] = createResource(
    entries,
    (items) => loadDailyReadStats(items ?? []),
  );

  onMount(() => {
    const refresh = () => {
      void refetch();
      void refetchDaily();
    };
    window.addEventListener('read-record-updated', refresh);
    window.addEventListener('bookshelf-book-updated', refresh);
    onCleanup(() => {
      window.removeEventListener('read-record-updated', refresh);
      window.removeEventListener('bookshelf-book-updated', refresh);
    });
  });

  const recentEntries = createMemo(() => entries() ?? []);

  const dateFilterDeps = createMemo(() => ({
    dateKey: selectedDate(),
    stats: dailyStats(),
  }));

  const {
    filtered: filteredEntries,
    filtering: dateFiltering,
    progressText: dateFilterProgress,
  } = useChunkedFilter({
    items: recentEntries,
    deps: () => dateFilterDeps(),
    isPassThrough: () => !dateFilterDeps().dateKey,
    match: (entry) =>
      readRecordEntryMatchesDate(entry, dateFilterDeps().dateKey, dateFilterDeps().stats),
    progressLabel: '正在筛选阅读记录',
  });

  const rankEntries = useReadRecordRankEntries(filteredEntries);

  const stats = createMemo(() => computeReadRecordStats(recentEntries()));
  const todaySeconds = createMemo(() => {
    const todayKey = formatDateKey(Date.now());
    return dailyStats()?.dailyReadTimes.get(todayKey) ?? 0;
  });
  const enableReadRecord = () => settingsStore.state.app.enableReadRecord !== false;

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
    if (!confirm('确定清空全部阅读记录？书架阅读进度将保留。')) return;
    await readRecordsDb.clearAllReadRecords();
    await readRecordDetailsDb.clearAllReadRecordDetails();
    window.dispatchEvent(new CustomEvent('read-record-updated'));
    void refetch();
  }

  return (
    <section class={cn(tabEnterClass(), mainShellPageRoot)}>
      <PageToolbar
        title="阅读记录"
        description="查看你的阅读历史"
        titleSlot={
          <PageToolbarTitleDropdown
            title="阅读记录"
            description="查看你的阅读历史"
            dropdownEnabled={false}
          />
        }
        leading={props.onBack ? <SettingsToolbarLeading onBack={props.onBack} /> : undefined}
      >
        <AppTooltip>
          <AppTooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            class="size-9"
            aria-label="打开阅读日历"
            onClick={() => setCalendarOpen(true)}
          >
            <CalendarDaysIcon class="h-5 w-5" size={20} />
          </AppTooltipTrigger>
          <AppTooltipContent>打开阅读日历</AppTooltipContent>
        </AppTooltip>
        <AppDropdownMenu>
          <AppTooltip>
            <AppTooltipTrigger as="div">
              <AppDropdownMenuTrigger
                as={(triggerProps: Record<string, unknown>) => (
                  <AppDropdownMenuIconTrigger triggerProps={triggerProps} class="size-9">
                    <MoreIcon class="h-5 w-5" size={20} />
                    <span class="sr-only">更多操作</span>
                  </AppDropdownMenuIconTrigger>
                )}
              />
            </AppTooltipTrigger>
            <AppTooltipContent>更多操作</AppTooltipContent>
          </AppTooltip>
          <AppDropdownMenuContent align="end">
            <AppDropdownMenuCheckboxItem
              checked={enableReadRecord()}
              closeOnSelect={false}
              onChange={(checked) => void settingsStore.setEnableReadRecord(!!checked)}
            >
              启用记录
            </AppDropdownMenuCheckboxItem>
            <AppDropdownMenuSeparator />
            <AppDropdownMenuItem
              class="text-destructive focus:text-destructive"
              onSelect={() => void handleClearAll()}
            >
              清空阅读记录
            </AppDropdownMenuItem>
          </AppDropdownMenuContent>
        </AppDropdownMenu>
      </PageToolbar>

      <div
        class={mainShellPageScroll}
        style={{
          '--read-record-preview-list-height': `${READ_RECORD_PREVIEW_LIST_HEIGHT_PX}px`,
          '--read-record-archive-list-height': `${READ_RECORD_ARCHIVE_LIST_HEIGHT_PX}px`,
        }}
      >
        <div class="flex min-h-0 flex-col gap-6 pb-4">
          <Show when={entries.loading}>
            <p class="text-sm text-muted-foreground">加载中…</p>
          </Show>

          <Show when={!entries.loading} fallback={null}>
            <ReadRecordGoalCard
              todaySeconds={todaySeconds()}
              totalSeconds={stats().totalSeconds}
              bookCount={stats().bookCount}
            />

            <Show when={recentEntries().length > 0}>
              <ReadRecordOverviewSection
                stats={stats()}
                recentEntries={recentEntries}
              />
            </Show>

            <Show when={!dailyStats.loading && dailyStats()}>
              {(stats) => <ReadRecordHeatmap stats={stats()} />}
            </Show>

            <Show when={selectedDate()}>
              {(dateKey) => (
                <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5">
                  <div class="min-w-0 text-sm text-foreground">
                    已筛选
                    <span class="font-medium">{formatSelectedDateLabel(dateKey())}</span>
                    的阅读记录
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="text-destructive hover:text-destructive"
                    onClick={() => setSelectedDate(null)}
                  >
                    <XIcon class="mr-1 h-3.5 w-3.5" size={14} />
                    清除筛选
                  </Button>
                </div>
              )}
            </Show>

            <Show when={dateFiltering() && dateFilterProgress()}>
              <p class="text-center text-xs text-muted-foreground">{dateFilterProgress()}</p>
            </Show>

            <ReadRecordListsSection
              recentEntries={filteredEntries}
              rankEntries={rankEntries}
              onOpenBook={props.onOpenBook}
              onSearchBook={props.onSearchBook}
              onOpenBookInfo={props.onOpenBookInfo}
              onDelete={(entry) => void handleDelete(entry)}
            />

            <ReadRecordArchiveSection
              entries={filteredEntries}
              onOpenBook={props.onOpenBook}
              onSearchBook={props.onSearchBook}
              onOpenBookInfo={props.onOpenBookInfo}
              onDelete={(entry) => void handleDelete(entry)}
            />
          </Show>
        </div>
      </div>

      <ReadRecordCalendarDrawer
        open={calendarOpen()}
        onOpenChange={setCalendarOpen}
        stats={dailyStats()}
        selectedDate={selectedDate()}
        onSelectedDateChange={setSelectedDate}
      />
    </section>
  );
}
