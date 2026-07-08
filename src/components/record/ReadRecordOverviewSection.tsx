/**
 * 阅读概览区：累计成就与统计卡片
 */

import { type Accessor } from 'solid-js';
import { ReadRecordSummaryCard } from '@/components/record/ReadRecordSummaryCard';
import {
  formatReadDuration,
  formatRelativeLastRead,
} from '@/lib/record/read-record-format';
import type { ReadRecordStats } from '@/lib/record/read-record-presenter';
import type { ReadRecordEntry } from '@/lib/record/read-record-presenter';
import { ThemedRecordSectionCard } from '@/components/theme/ThemedRecordSectionCard';
import { cn } from '@/lib/utils';

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

export interface ReadRecordOverviewSectionProps {
  class?: string;
  stats: ReadRecordStats;
  recentEntries: Accessor<readonly ReadRecordEntry[]>;
}

export function ReadRecordOverviewSection(props: ReadRecordOverviewSectionProps) {
  return (
    <ThemedRecordSectionCard class={cn('min-w-0 flex-1 space-y-4', props.class)}>
      <div class="space-y-1">
        <h3 class="font-semibold text-foreground">阅读概览</h3>
        <p class="text-sm text-muted-foreground">累计阅读时长与在读书籍统计</p>
      </div>
      <ReadRecordSummaryCard
        totalSeconds={props.stats.totalSeconds}
        bookCount={props.stats.bookCount}
        recentEntries={props.recentEntries}
      />
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <RecordStatCard
          label="累计阅读"
          value={formatReadDuration(props.stats.totalSeconds)}
          highlight
        />
        <RecordStatCard
          label="在读书籍"
          value={`${props.stats.bookCount} 本`}
        />
        <RecordStatCard
          label="最近阅读"
          value={(() => {
            const latest = props.stats.latestLastRead;
            return latest != null ? formatRelativeLastRead(latest) : '--';
          })()}
        />
      </div>
    </ThemedRecordSectionCard>
  );
}
