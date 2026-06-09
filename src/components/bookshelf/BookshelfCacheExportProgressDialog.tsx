/**
 * 缓存导出进度弹窗
 */

import { Show, createMemo } from 'solid-js';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Progress } from '@/components/ui/progress';
import type { CacheExportProgressState } from '@/lib/export/run-cache-export';

export interface BookshelfCacheExportProgressDialogProps {
  open: boolean;
  bookName: string;
  progress: CacheExportProgressState | null;
}

export function BookshelfCacheExportProgressDialog(
  props: BookshelfCacheExportProgressDialogProps,
) {
  const value = createMemo(() => {
    const p = props.progress;
    if (!p || p.total <= 0) return 0;
    return Math.min(100, Math.round((p.current / p.total) * 100));
  });

  return (
    <AppDialog open={props.open} onOpenChange={() => {}}>
      <AppDialogContent
        class="sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <AppDialogHeader showClose={false}>
          <AppDialogTitle>正在导出</AppDialogTitle>
          <AppDialogDescription class="truncate">
            {props.bookName}
          </AppDialogDescription>
        </AppDialogHeader>
        <div class="space-y-3 px-6 pb-6">
          <Show when={props.progress}>
            {(p) => (
              <>
                <p class="text-sm text-muted-foreground">{p().phase}</p>
                <div class="space-y-1">
                  <div class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>进度</span>
                    <span class="tabular-nums">{value()}%</span>
                  </div>
                  <Progress value={value()} />
                </div>
                <Show when={p().total > 0}>
                  <p class="text-xs text-muted-foreground tabular-nums">
                    {p().current} / {p().total}
                  </p>
                </Show>
              </>
            )}
          </Show>
        </div>
      </AppDialogContent>
    </AppDialog>
  );
}
