/**
 * 阅读热力图（对齐 legado-own ReadHeatmapView + GitHub 贡献图时间段切换）
 */

import { createMemo, createSignal, For, Show } from 'solid-js';
import { AppTabs } from '@/components/shared/AppTabs';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '@/components/shared/AppTooltip';
import {
  buildHeatmapCells,
  fillHeatmapCells,
  HEATMAP_PERIOD_DAYS,
  HEATMAP_PERIOD_LABELS,
  heatmapMonthLabels,
  type DailyReadStats,
  type HeatmapCell,
  type HeatmapPeriod,
} from '@/lib/record/read-record-daily';
import { formatReadDuration, formatFriendlyDate } from '@/lib/record/read-record-format';
import { READ_RECORD_SECTION_CARD_CLASS } from '@/lib/record/read-record-layout';
import { cn } from '@/lib/utils';

const HEATMAP_PERIODS: HeatmapPeriod[] = ['year', 'half-year', 'quarter', 'month', 'week'];

function resolveHeatmapCellClass(readTimeSeconds: number, maxReadTime: number): string {
  if (readTimeSeconds <= 0) return 'bg-primary/[0.08]';
  const ratio = readTimeSeconds / maxReadTime;
  if (ratio >= 0.85) return 'bg-primary/[0.92]';
  if (ratio >= 0.65) return 'bg-primary/[0.78]';
  if (ratio >= 0.4) return 'bg-primary/[0.6]';
  return 'bg-primary/[0.36]';
}

function chunkHeatmapColumns(cells: HeatmapCell[]): HeatmapCell[][] {
  const columns: HeatmapCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    columns.push(cells.slice(i, i + 7));
  }
  return columns;
}

function HeatmapGrid(props: { cells: HeatmapCell[] }) {
  const maxReadTime = createMemo(() =>
    Math.max(1, ...props.cells.map((cell) => cell.readTimeSeconds)),
  );
  const columns = createMemo(() => chunkHeatmapColumns(props.cells));

  return (
    <div class="flex h-[120px] w-full gap-1">
      <For each={columns()}>
        {(week) => (
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <For each={week}>
              {(cell) => (
                <AppTooltip>
                  <AppTooltipTrigger
                    class={cn(
                      'block min-h-0 w-full flex-1 rounded-sm border-0 p-0',
                      resolveHeatmapCellClass(cell.readTimeSeconds, maxReadTime()),
                    )}
                    aria-label={`${formatFriendlyDate(cell.dateKey)} ${formatReadDuration(cell.readTimeSeconds)}`}
                  />
                  <AppTooltipContent>
                    <div class="text-xs">
                      <div>{formatFriendlyDate(cell.dateKey)}</div>
                      <div class="text-muted-foreground">
                        {cell.readTimeSeconds > 0
                          ? formatReadDuration(cell.readTimeSeconds)
                          : '无阅读记录'}
                      </div>
                    </div>
                  </AppTooltipContent>
                </AppTooltip>
              )}
            </For>
          </div>
        )}
      </For>
    </div>
  );
}

export interface ReadRecordHeatmapProps {
  stats: DailyReadStats;
}

export function ReadRecordHeatmap(props: ReadRecordHeatmapProps) {
  const [period, setPeriod] = createSignal<HeatmapPeriod>('quarter');

  const cells = createMemo(() =>
    fillHeatmapCells(buildHeatmapCells(period()), props.stats),
  );
  const monthLabels = createMemo(() => heatmapMonthLabels(cells()));
  const hasActivity = createMemo(() =>
    cells().some((cell) => cell.readTimeSeconds > 0),
  );
  const periodHint = createMemo(() => {
    const days = HEATMAP_PERIOD_DAYS[period()];
    const weeks = Math.ceil(days / 7);
    return `最近 ${weeks} 周 · ${days} 天`;
  });

  return (
    <section class={cn(READ_RECORD_SECTION_CARD_CLASS, 'flex min-w-0 flex-1 flex-col gap-4')}>
      <div class="space-y-1">
        <h3 class="font-semibold text-foreground">阅读热力图</h3>
        <p class="text-sm text-muted-foreground">{periodHint()}</p>
      </div>

      <AppTabs
        layout="stacked"
        variant="settings-equal"
        value={period()}
        options={HEATMAP_PERIODS}
        labels={HEATMAP_PERIOD_LABELS}
        ariaLabel="热力图时间段"
        onChange={(value) => setPeriod(value as HeatmapPeriod)}
      />

      <Show
        when={monthLabels().length > 0}
      >
        <div class="flex justify-between px-0.5 text-[11px] text-muted-foreground">
          <For each={monthLabels()}>{(label) => <span>{label}</span>}</For>
        </div>
      </Show>

      <Show
        when={hasActivity() || props.stats.hasDetailData}
        fallback={
          <div class="flex h-[120px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 text-sm text-muted-foreground">
            暂无阅读热力数据
          </div>
        }
      >
        <HeatmapGrid cells={cells()} />
      </Show>

      <div class="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
        <span>少</span>
        <div class="size-3 rounded-sm bg-primary/8" />
        <div class="size-3 rounded-sm bg-primary/36" />
        <div class="size-3 rounded-sm bg-primary/60" />
        <div class="size-3 rounded-sm bg-primary/78" />
        <div class="size-3 rounded-sm bg-primary/92" />
        <span>多</span>
      </div>
    </section>
  );
}
