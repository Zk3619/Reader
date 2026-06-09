/**
 * 阅读目标卡片（对齐 legado-own panel_goal_card）
 */

import { createMemo, createSignal, Show } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ReadRecordGoalEditDialog } from '@/components/record/ReadRecordGoalEditDialog';
import { AuthorIcon, PencilIcon } from '@/components/shared/icons';
import { formatReadDuration } from '@/lib/record/read-record-format';
import {
  computeReadGoalProgressPercent,
  loadReadRecordGoalConfig,
  saveReadRecordGoalConfig,
  type ReadRecordGoalConfig,
} from '@/lib/record/read-record-goal';
import { READ_RECORD_SECTION_CARD_CLASS } from '@/lib/record/read-record-layout';
import { cn } from '@/lib/utils';

export interface ReadRecordGoalCardProps {
  class?: string;
  todaySeconds: number;
  totalSeconds: number;
  bookCount: number;
}

export function ReadRecordGoalCard(props: ReadRecordGoalCardProps) {
  const [config, setConfig] = createSignal<ReadRecordGoalConfig>(loadReadRecordGoalConfig());
  const [editOpen, setEditOpen] = createSignal(false);

  const goalSeconds = () => config().dailyGoalMinutes * 60;
  const progressPercent = createMemo(() =>
    computeReadGoalProgressPercent(props.todaySeconds, config().dailyGoalMinutes),
  );

  function handleSave(next: ReadRecordGoalConfig) {
    setConfig(next);
    saveReadRecordGoalConfig(next);
  }

  return (
    <>
      <section class={cn(READ_RECORD_SECTION_CARD_CLASS, 'space-y-4', props.class)}>
        <div class="flex items-center justify-between gap-2">
          <h3 class="font-semibold text-foreground">阅读目标</h3>
          <Tooltip>
            <TooltipTrigger
              as={Button}
              variant="ghost"
              size="icon"
              class="size-7 text-muted-foreground hover:text-foreground"
              aria-label="编辑阅读目标"
              onClick={() => setEditOpen(true)}
            >
              <PencilIcon class="h-4 w-4" size={16} />
            </TooltipTrigger>
            <TooltipContent>编辑阅读目标</TooltipContent>
          </Tooltip>
        </div>

        <div class="flex items-start gap-3.5">
          <div class="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/50 bg-muted">
            <Show
              when={config().avatar}
              fallback={<AuthorIcon class="h-7 w-7 text-muted-foreground" size={28} />}
            >
              {(avatar) => (
                <img
                  src={avatar()}
                  alt=""
                  class="h-full w-full object-cover"
                  loading="lazy"
                />
              )}
            </Show>
          </div>

          <div class="min-w-0 flex-1 space-y-1.5">
            <Show when={config().userName}>
              <p class="truncate text-xs text-muted-foreground">{config().userName}</p>
            </Show>
            <p class="text-base font-semibold text-foreground">
              今日 {formatReadDuration(props.todaySeconds)}
            </p>
            <p class="text-sm text-muted-foreground">
              今日目标 {formatReadDuration(props.todaySeconds)} / {formatReadDuration(goalSeconds())}
            </p>
            <div class="h-2 overflow-hidden rounded-full bg-muted">
              <div
                class="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${progressPercent()}%` }}
              />
            </div>
          </div>
        </div>

        <div class="flex gap-3 text-sm text-muted-foreground">
          <span class="min-w-0 flex-1">累计 {formatReadDuration(props.totalSeconds)}</span>
          <span class="shrink-0 text-right">已读书籍 {props.bookCount} 本</span>
        </div>
      </section>

      <ReadRecordGoalEditDialog
        open={editOpen()}
        onOpenChange={setEditOpen}
        initial={config()}
        onSave={handleSave}
      />
    </>
  );
}
