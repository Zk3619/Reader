/**
 * 书籍信息页 — 查看目录（对齐 legado BookInfoActivity.openChapterList）
 */

import { For, Show, createEffect, createSignal } from 'solid-js';
import {
  AppDialog,
  AppDialogContent,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { cn } from '@/lib/utils';
import type { BookChapter } from '@/types';

export interface BookInfoChapterListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookName: string;
  chapters: BookChapter[];
  loading?: boolean;
  error?: string | null;
}

function isUnderVolume(list: BookChapter[], idx: number): boolean {
  for (let k = idx - 1; k >= 0; k--) {
    if (list[k].isVolume) return true;
  }
  return false;
}

export function BookInfoChapterListDialog(props: BookInfoChapterListDialogProps) {
  const [scrollEl, setScrollEl] = createSignal<HTMLDivElement | undefined>();

  createEffect(() => {
    if (!props.open) return;
    requestAnimationFrame(() => {
      const el = scrollEl();
      if (el) el.scrollTop = 0;
    });
  });

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class="max-w-lg gap-3 p-4 sm:p-5">
        <AppDialogHeader class="space-y-1 pb-0">
          <AppDialogTitle class="text-base">目录 · {props.bookName}</AppDialogTitle>
        </AppDialogHeader>
        <div
          ref={setScrollEl}
          class="max-h-[min(70vh,520px)] overflow-y-auto rounded-md border border-border/60"
        >
          <Show
            when={!props.loading}
            fallback={
              <p class="px-4 py-8 text-center text-sm text-muted-foreground">正在加载目录…</p>
            }
          >
            <Show
              when={props.chapters.length > 0}
              fallback={
                <p class="px-4 py-8 text-center text-sm text-muted-foreground">
                  {props.error || '目录为空，请稍后重试'}
                </p>
              }
            >
              <ul class="py-1">
                <For each={props.chapters}>
                  {(ch, i) => (
                    <li
                      class={cn(
                        'px-3 py-2 text-sm text-foreground/90 border-b border-border/30 last:border-0',
                        ch.isVolume && 'font-medium bg-muted/30',
                        !ch.isVolume && isUnderVolume(props.chapters, i()) && 'pl-6',
                      )}
                    >
                      {ch.title || `第 ${i() + 1} 章`}
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Show>
        </div>
      </AppDialogContent>
    </AppDialog>
  );
}
