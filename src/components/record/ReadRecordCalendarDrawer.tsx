/**
 * 阅读日历抽屉（对齐 legados-main HeatmapCalendarBottomSheet）
 */

import { Show } from 'solid-js';
import {
  AppDrawer,
  AppDrawerBody,
  AppDrawerContent,
  AppDrawerHeader,
} from '@/components/shared/AppDrawer';
import { ReadRecordCalendar } from '@/components/record/ReadRecordCalendar';
import type { DailyReadStats } from '@/lib/record/read-record-daily';

export interface ReadRecordCalendarDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stats: DailyReadStats | undefined;
  selectedDate: string | null;
  onSelectedDateChange: (dateKey: string | null) => void;
}

export function ReadRecordCalendarDrawer(props: ReadRecordCalendarDrawerProps) {
  return (
    <AppDrawer
      open={props.open}
      onOpenChange={props.onOpenChange}
      side="right"
      snapPoints={[0, 1]}
      defaultSnapPoint={1}
    >
      <AppDrawerContent class="flex flex-col overflow-hidden" showNativeDragHandle={false}>
        <AppDrawerHeader
          title="阅读日历"
          class="shrink-0 border-b border-border/40"
        />
        <AppDrawerBody class="min-h-0 flex-1 overflow-y-auto scroll-gutter-stable-both px-4 pb-6">
          <Show when={props.stats}>
            {(stats) => (
              <ReadRecordCalendar
                variant="plain"
                stats={stats()}
                selectedDate={props.selectedDate}
                onSelectedDateChange={props.onSelectedDateChange}
              />
            )}
          </Show>
        </AppDrawerBody>
      </AppDrawerContent>
    </AppDrawer>
  );
}
