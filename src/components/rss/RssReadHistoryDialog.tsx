/**
 * RSS 阅读历史记录对话框（对齐 Legado ReadRecordDialog）
 */

import { createSignal, createMemo, createEffect, For, Show } from 'solid-js';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { TextField, TextFieldInput } from '@/components/ui/text-field';
import { TruncatedTooltip } from '@/components/shared/TruncatedTooltip';
import { getAllRssReadRecords } from '@/lib/database/rss-read-records';
import type { RssReadRecord } from '@/types';
import { cn } from '@/lib/utils';
import { scrollGutterStableBoth } from '@/lib/ui/viewport-classes';

export interface RssReadHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenRecord?: (record: RssReadRecord) => void;
}

function formatReadTime(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RssReadHistoryDialog(props: RssReadHistoryDialogProps) {
  const [records, setRecords] = createSignal<RssReadRecord[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal('');

  const filteredRecords = createMemo(() => {
    const q = searchQuery().trim().toLowerCase();
    if (!q) return records();
    return records().filter(
      (r) =>
        (r.title?.toLowerCase().includes(q) ?? false) ||
        r.record.toLowerCase().includes(q),
    );
  });

  async function reload() {
    setLoading(true);
    try {
      setRecords(await getAllRssReadRecords());
    } finally {
      setLoading(false);
    }
  }

  createEffect(() => {
    if (props.open) void reload();
  });

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <AppDialogContent layout="app" class="max-h-[85dvh]! w-full max-w-lg">
        <AppDialogHeader class="shrink-0 px-6 pt-6">
          <AppDialogTitle>阅读记录</AppDialogTitle>
          <AppDialogDescription>点击条目可重新打开文章</AppDialogDescription>
        </AppDialogHeader>

        <div class="shrink-0 px-6">
          <TextField>
            <TextFieldInput
              placeholder="搜索标题或链接"
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
            />
          </TextField>
        </div>

        <div
          class={cn(
            'min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4',
            scrollGutterStableBoth,
          )}
        >
          <Show when={loading()}>
            <div class="py-8 text-center text-sm text-muted-foreground">加载中…</div>
          </Show>

          <Show when={!loading() && filteredRecords().length === 0}>
            <div class="rounded-lg border border-border/50 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              暂无阅读记录
            </div>
          </Show>

          <ul class="space-y-1">
            <For each={filteredRecords()}>
              {(record) => (
                <li>
                  <button
                    type="button"
                    class="flex w-full flex-col gap-0.5 rounded-lg border border-border/50 bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent/30"
                    onClick={() => {
                      props.onOpenRecord?.(record);
                      props.onOpenChange(false);
                    }}
                  >
                    <TruncatedTooltip
                      as="span"
                      text={record.title || record.record}
                      class="text-sm font-medium text-foreground"
                    />
                    <Show when={formatReadTime(record.readTime)}>
                      <span class="text-xs text-muted-foreground">
                        {formatReadTime(record.readTime)}
                      </span>
                    </Show>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </div>
      </AppDialogContent>
    </AppDialog>
  );
}
