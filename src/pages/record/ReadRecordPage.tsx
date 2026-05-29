/**
 * 阅读记录列表
 */

import { createResource, For, Show } from 'solid-js';
import * as readRecordsDb from '@/lib/database/read-records';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h} 小时 ${rm} 分钟` : `${h} 小时`;
}

export function ReadRecordPage() {
  const [records] = createResource(() => readRecordsDb.getAllReadRecords());

  return (
    <div class="space-y-4">
      <Show when={records.loading}>
        <p class="text-sm text-muted-foreground">加载中…</p>
      </Show>
      <Show when={!records.loading && (records() ?? []).length === 0}>
        <div class="rounded-2xl border border-border/50 bg-card p-8 text-center text-muted-foreground">
          <p>暂无阅读记录</p>
          <p class="mt-2 text-xs">在阅读器中阅读后会累计时长</p>
        </div>
      </Show>
      <ul class="space-y-2">
        <For each={records() ?? []}>
          {(rec) => (
            <li class="rounded-xl border border-border/50 bg-card px-4 py-3">
              <div class="font-medium">{rec.bookName}</div>
              <Show when={rec.bookAuthor}>
                <div class="text-xs text-muted-foreground">{rec.bookAuthor}</div>
              </Show>
              <div class="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>累计 {formatDuration(rec.readTime)}</span>
                <Show when={rec.durChapterTitle}>
                  <span>读到：{rec.durChapterTitle}</span>
                </Show>
                <span>
                  最近：{new Date(rec.lastRead).toLocaleString()}
                </span>
              </div>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
