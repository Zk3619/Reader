/**
 * RSS 阅读历史记录对话框（对齐 Legado ReadRecordDialog）
 */

import { createSignal, createEffect, Show } from 'solid-js';
import { useChunkedFilter } from '@/lib/hooks/useChunkedFilter';
import { rssReadRecordMatchesSearch } from '@/lib/rss/rss-read-record-filter';
import { VirtualList } from '@/components/shared/virtual-list';
import {
  AppDialog,
  AppDialogScrollBody,
  AppDialogContent,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { TextField, TextFieldInput } from '@/components/ui/text-field';
import { TruncatedTooltip } from '@/components/shared/TruncatedTooltip';
import {
  getAllRssReadRecords,
  getRssReadRecordsByOrigin,
} from '@/lib/database/rss-read-records';
import type { RssReadRecord } from '@/types';
import { dialogScrollFrameFlex } from '@/lib/ui/viewport-classes';

export interface RssReadHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 仅显示指定订阅源的记录（对齐 Legado ReadRecordDialog sourceUrl 过滤） */
  origin?: string;
  onOpenRecord?: (record: RssReadRecord) => void;
}

function formatReadTime(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RssReadHistoryDialog(props: RssReadHistoryDialogProps) {
  let scrollTrack: HTMLDivElement | undefined;
  const [records, setRecords] = createSignal<RssReadRecord[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal('');

  const { filtered: filteredRecords, filtering, progressText: filterProgressText } =
    useChunkedFilter({
      items: records,
      deps: () => searchQuery(),
      isPassThrough: () => records().length > 0 && !searchQuery().trim(),
      match: (record) => rssReadRecordMatchesSearch(record, searchQuery()),
      progressLabel: '正在筛选阅读记录',
    });

  async function reload() {
    setLoading(true);
    try {
      const origin = props.origin?.trim();
      setRecords(
        origin
          ? await getRssReadRecordsByOrigin(origin)
          : await getAllRssReadRecords(),
      );
    } finally {
      setLoading(false);
    }
  }

  createEffect(() => {
    if (props.open) void reload();
  });

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange} modal>
      <AppDialogContent layout="app" class="max-w-lg">
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

        <AppDialogScrollBody
          frameClass={dialogScrollFrameFlex}
          trackRef={(el) => {
            scrollTrack = el;
          }}
        >
          <Show when={loading()}>
            <div class="py-8 text-center text-sm text-muted-foreground">加载中…</div>
          </Show>

          <Show when={filtering() && filterProgressText()}>
            <div class="pb-2 text-center text-xs text-muted-foreground">
              {filterProgressText()}
            </div>
          </Show>

          <Show when={!loading() && filteredRecords().length === 0 && !filtering()}>
            <div class="rounded-lg border border-border/50 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              暂无阅读记录
            </div>
          </Show>

          <Show when={filteredRecords().length > 0}>
            <VirtualList
              class="space-y-1"
              items={filteredRecords}
              estimateSize={() => 64}
              overscan={4}
              externalScrollElement={() => scrollTrack ?? null}
              getItemKey={(record) => `${record.origin}::${record.record}`}
            >
              {(record) => (
                <div class="pb-1">
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
                </div>
              )}
            </VirtualList>
          </Show>
        </AppDialogScrollBody>
      </AppDialogContent>
    </AppDialog>
  );
}
