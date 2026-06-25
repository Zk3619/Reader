/**
 * 阅读日历（对齐 legados-main HeatmapCalendar）
 */

import { createMemo, createSignal, For, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from '@/components/shared/icons';
import {
  settingsOptionTabsEqualWidthListClass,
  settingsOptionTabsEqualWidthTriggerClass,
} from '@/lib/settings/settings-tab-styles';
import {
  buildMonthCalendarDays,
  formatSelectedDateLabel,
  getCalendarCellValue,
  getCalendarMaxValue,
  heatmapIntensity,
  isSameMonth,
  type DailyReadStats,
  type HeatmapCalendarMode,
} from '@/lib/record/read-record-daily';
import { formatDateKey, formatReadDuration } from '@/lib/record/read-record-format';
import { READ_RECORD_SECTION_CARD_CLASS } from '@/lib/record/read-record-layout';
import { cn } from '@/lib/utils';

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;

function MonthStatPill(props: { label: string; value: string }) {
  return (
    <div class="flex min-w-0 flex-1 flex-col items-center rounded-lg bg-card/70 px-2 py-1.5">
      <span class="text-[11px] text-muted-foreground">{props.label}</span>
      <span class="mt-0.5 truncate text-xs font-semibold tabular-nums text-foreground">
        {props.value}
      </span>
    </div>
  );
}

function HeatmapLegend() {
  const levels = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div class="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
      <span>少</span>
      <For each={levels}>
        {(level) => (
          <div
            class="size-3 rounded-sm"
            style={{
              'background-color':
                level === 0
                  ? 'hsl(var(--muted) / 0.55)'
                  : `hsl(var(--primary) / ${0.2 + level * level * 0.75})`,
            }}
          />
        )}
      </For>
      <span>多</span>
    </div>
  );
}

export interface ReadRecordCalendarProps {
  class?: string;
  stats: DailyReadStats;
  selectedDate: string | null;
  onSelectedDateChange: (dateKey: string | null) => void;
  /** plain：抽屉内；card：独立卡片（保留兼容） */
  variant?: 'plain' | 'card';
}

export function ReadRecordCalendar(props: ReadRecordCalendarProps) {
  const todayKey = formatDateKey(Date.now());
  const today = new Date();
  const [year, setYear] = createSignal(today.getFullYear());
  const [month, setMonth] = createSignal(today.getMonth() + 1);
  const [mode, setMode] = createSignal<HeatmapCalendarMode>('time');

  const maxValue = createMemo(() => getCalendarMaxValue(mode(), props.stats));
  const monthDays = createMemo(() => {
    const keys = buildMonthCalendarDays(year(), month());
    return keys.map((dateKey) => ({
      dateKey,
      inMonth: isSameMonth(dateKey, year(), month()),
    }));
  });

  const monthStats = createMemo(() => {
    let readCount = 0;
    let readTimeSeconds = 0;
    let activeDays = 0;
    for (const { dateKey, inMonth } of monthDays()) {
      if (!inMonth) continue;
      const count = props.stats.dailyReadCounts.get(dateKey) ?? 0;
      const time = props.stats.dailyReadTimes.get(dateKey) ?? 0;
      readCount += count;
      readTimeSeconds += time;
      if (count > 0 || time > 0) activeDays += 1;
    }
    return { readCount, readTimeSeconds, activeDays };
  });

  function shiftMonth(delta: number) {
    let nextMonth = month() + delta;
    let nextYear = year();
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    setYear(nextYear);
    setMonth(nextMonth);
  }

  function handleDateClick(dateKey: string, inMonth: boolean) {
    if (!inMonth) return;
    props.onSelectedDateChange(props.selectedDate === dateKey ? null : dateKey);
  }

  const content = (
    <>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <Show when={(props.variant ?? 'card') === 'card'}>
          <div class="space-y-1">
            <h3 class="font-semibold text-foreground">阅读日历</h3>
            <p class="text-sm text-muted-foreground">按月查看阅读活跃与时长分布</p>
          </div>
        </Show>
        <Tabs
          value={mode()}
          onChange={(value) => setMode(value as HeatmapCalendarMode)}
          class={cn('w-full', (props.variant ?? 'card') === 'card' ? 'sm:w-auto' : '')}
        >
          <TabsList class={settingsOptionTabsEqualWidthListClass}>
            <TabsTrigger value="count" class={settingsOptionTabsEqualWidthTriggerClass}>
              次数
            </TabsTrigger>
            <TabsTrigger value="time" class={settingsOptionTabsEqualWidthTriggerClass}>
              时长
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div class="rounded-lg bg-muted/40 p-3">
        <div class="flex items-center justify-between gap-2">
          <AppTooltip>
            <AppTooltipTrigger
              as={Button}
              variant="ghost"
              size="icon"
              class="h-8 w-8 shrink-0"
              aria-label="上个月"
              onClick={() => shiftMonth(-1)}
            >
              <ChevronLeftIcon class="h-4 w-4" size={16} />
            </AppTooltipTrigger>
            <AppTooltipContent>上个月</AppTooltipContent>
          </AppTooltip>
          <div class="min-w-0 text-center">
            <div class="text-sm font-semibold text-foreground">
              {year()}年{month()}月
            </div>
            <div class="text-[11px] text-muted-foreground">
              {mode() === 'count' ? '按阅读次数显示' : '按阅读时长显示'}
            </div>
          </div>
          <AppTooltip>
            <AppTooltipTrigger
              as={Button}
              variant="ghost"
              size="icon"
              class="h-8 w-8 shrink-0"
              aria-label="下个月"
              onClick={() => shiftMonth(1)}
            >
              <ChevronRightIcon class="h-4 w-4" size={16} />
            </AppTooltipTrigger>
            <AppTooltipContent>下个月</AppTooltipContent>
          </AppTooltip>
        </div>

        <div class="mt-3 flex gap-2">
          <MonthStatPill label="阅读" value={`${monthStats().readCount}次`} />
          <MonthStatPill
            label="时长"
            value={formatReadDuration(monthStats().readTimeSeconds)}
          />
          <MonthStatPill label="天数" value={`${monthStats().activeDays}天`} />
        </div>
      </div>

      <div class="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted-foreground">
        <For each={WEEKDAY_LABELS}>{(label) => <span>{label}</span>}</For>
      </div>

      <div class="grid grid-cols-7 gap-1">
        <For each={monthDays()}>
          {({ dateKey, inMonth }) => {
            const value = () => getCalendarCellValue(dateKey, mode(), props.stats);
            const isSelected = () => props.selectedDate === dateKey;
            const isToday = () => dateKey === todayKey;
            const intensity = () => heatmapIntensity(value(), maxValue());
            const textStrong = () =>
              isSelected() || (value() > 0 && intensity() > 0.72);

            return (
              <Button
                type="button"
                variant="ghost"
                disabled={!inMonth}
                class={cn(
                  'aspect-square h-auto w-full rounded-lg p-0 text-xs tabular-nums transition-colors',
                  !inMonth && 'cursor-default opacity-35',
                  inMonth && 'hover:ring-1 hover:ring-primary/30',
                  isSelected() && 'bg-primary font-semibold text-primary-foreground ring-2 ring-primary/70',
                  !isSelected() && isToday() && 'ring-2 ring-primary',
                  !isSelected() && value() <= 0 && inMonth && 'bg-muted/45 text-muted-foreground',
                  !isSelected() && value() > 0 && textStrong() && 'font-semibold text-primary-foreground',
                  !isSelected() && value() > 0 && !textStrong() && 'text-foreground',
                )}
                style={
                  !isSelected() && value() > 0 && inMonth
                    ? {
                        'background-color': `hsl(var(--primary) / ${0.14 + intensity() * 0.82})`,
                      }
                    : undefined
                }
                onClick={() => handleDateClick(dateKey, inMonth)}
              >
                {parseInt(dateKey.split('-')[2] ?? '0', 10)}
              </Button>
            );
          }}
        </For>
      </div>

      <HeatmapLegend />

      <Show when={!props.stats.hasDetailData}>
        <p class="text-xs text-muted-foreground">
          时长数据将在后续阅读中逐步积累；当前次数由最近阅读时间推断。
        </p>
      </Show>

      <Show when={props.selectedDate}>
        {(dateKey) => {
          const count = () => props.stats.dailyReadCounts.get(dateKey()) ?? 0;
          const time = () => props.stats.dailyReadTimes.get(dateKey()) ?? 0;
          return (
            <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
              <div class="min-w-0">
                <div class="text-sm font-medium text-foreground">
                  {formatSelectedDateLabel(dateKey())}
                </div>
                <div class="text-xs text-muted-foreground">
                  {count()}次 · {formatReadDuration(time())}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                class="text-destructive hover:text-destructive"
                onClick={() => props.onSelectedDateChange(null)}
              >
                <XIcon class="mr-1 h-3.5 w-3.5" size={14} />
                清除筛选
              </Button>
            </div>
          );
        }}
      </Show>
    </>
  );

  if ((props.variant ?? 'card') === 'plain') {
    return <div class={cn('flex flex-col gap-4 py-4', props.class)}>{content}</div>;
  }

  return (
    <section
      class={cn(
        READ_RECORD_SECTION_CARD_CLASS,
        'flex min-w-0 flex-1 flex-col gap-4',
        props.class,
      )}
    >
      {content}
    </section>
  );
}
