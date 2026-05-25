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
import { Button } from '@/components/ui/button';
import { scrollGutterStableBoth } from '@/lib/ui/viewport-classes';
import { cn } from '@/lib/utils';
import type { BookChapter } from '@/types';

export interface BookInfoChapterListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookName: string;
  chapters: BookChapter[];
  loading?: boolean;
  error?: string | null;
  /** 当前阅读章节索引，用于高亮 */
  currentChapterIndex?: number;
  /** 点击章节（含卷标题）跳转阅读 */
  onSelectChapter: (index: number) => void;
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
      <AppDialogContent>
        <AppDialogHeader>
          <AppDialogTitle class="text-base">目录 · {props.bookName}</AppDialogTitle>
        </AppDialogHeader>
        <div
          ref={setScrollEl}
          class={cn(
            'max-h-[min(70vh,520px)] overflow-y-auto overscroll-contain',
            scrollGutterStableBoth,
          )}
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
                  {(ch, i) => {
                    const idx = i();
                    const isCurrent = () => idx === (props.currentChapterIndex ?? -1);
                    return (
                      <li
                        class={cn(
                          'border-b border-border/30 last:border-0 py-0.5',
                          ch.isVolume && 'bg-muted/30',
                          !ch.isVolume && isUnderVolume(props.chapters, idx) && 'pl-3',
                        )}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          class={cn(
                            'h-auto min-h-9 w-full justify-start rounded-md px-3 py-2 text-left text-sm font-normal',
                            ch.isVolume && 'font-medium text-muted-foreground',
                            isCurrent()
                              ? 'bg-primary/10 font-medium text-primary hover:bg-primary/15'
                              : 'text-foreground/90 hover:bg-muted/80',
                          )}
                          onClick={() => props.onSelectChapter(idx)}
                        >
                          <span class="truncate">{ch.title || `第 ${idx + 1} 章`}</span>
                        </Button>
                      </li>
                    );
                  }}
                </For>
              </ul>
            </Show>
          </Show>
        </div>
      </AppDialogContent>
    </AppDialog>
  );
}
