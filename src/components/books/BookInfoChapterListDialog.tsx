/**
 * 书籍信息页 — 查看目录（对齐 legado BookInfoActivity.openChapterList）
 */

import { Show, createEffect, createMemo } from 'solid-js';
import {
  AppDialog,
  AppDialogContent,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { Button } from '@/components/ui/button';
import {
  dialogVirtualListPanelHeight,
  dialogVirtualListPanelMaxHeight,
  dialogVirtualListPanelWidth,
  scrollGutterStableBoth,
} from '@/lib/ui/viewport-classes';
import { ChapterCacheCloudIcon } from '@/components/books/ChapterCacheCloudIcon';
import {
  scrollCatalogIndexIntoView,
  VirtualChapterList,
} from '@/components/books/VirtualChapterList';
import { useCachedChapterIndices } from '@/lib/chapter-cache/use-cached-chapter-indices';
import { buildChapterRowMetas, CATALOG_ROW_HEIGHT_PX } from '@/lib/catalog/chapter-list-layout';
import { cn } from '@/lib/utils';
import type { BookChapter } from '@/types';

export interface BookInfoChapterListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookName: string;
  /** 在线书 URL，用于查询章节缓存 */
  bookUrl?: string;
  /** 是否显示未缓存云标（本地书为 false） */
  showChapterCacheHint?: boolean;
  chapters: BookChapter[];
  loading?: boolean;
  error?: string | null;
  /** 当前阅读章节索引，用于高亮 */
  currentChapterIndex?: number;
  /** 点击章节（含卷标题）跳转阅读 */
  onSelectChapter: (index: number) => void;
}

export function BookInfoChapterListDialog(props: BookInfoChapterListDialogProps) {
  const cacheHintEnabled = () =>
    Boolean(props.showChapterCacheHint && props.bookUrl);
  const { cached: cachedIndices } = useCachedChapterIndices(
    () => props.bookUrl,
    () => props.open && cacheHintEnabled(),
    true,
  );
  const isChapterCached = (idx: number) => cachedIndices().has(idx);

  const rows = createMemo(() => buildChapterRowMetas(props.chapters));

  let scrollContainer: HTMLDivElement | undefined;

  createEffect(() => {
    if (!props.open) return;
    const idx = props.currentChapterIndex ?? -1;
    requestAnimationFrame(() => {
      const el = scrollContainer;
      if (!el) return;
      if (idx >= 0 && rows().length > 0) {
        scrollCatalogIndexIntoView(el, idx, CATALOG_ROW_HEIGHT_PX, 'auto');
      } else {
        el.scrollTop = 0;
      }
    });
  });

  return (
    <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent class={dialogVirtualListPanelWidth}>
        <AppDialogHeader>
          <AppDialogTitle class="text-base">目录 · {props.bookName}</AppDialogTitle>
        </AppDialogHeader>
        <div
          class={cn(
            'flex flex-col overflow-hidden',
            dialogVirtualListPanelHeight,
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
              <VirtualChapterList
                class={cn('min-h-0 w-full flex-1', dialogVirtualListPanelMaxHeight)}
                count={rows().length}
                onScrollContainer={(el) => {
                  scrollContainer = el;
                }}
              >
                {(index) => {
                  const row = rows()[index];
                  if (!row) return null;
                  const { chapter, underVolume } = row;
                  const isCurrent = index === (props.currentChapterIndex ?? -1);

                  return (
                    <div
                      class={cn(
                        'box-border w-full min-w-0 border-b border-border/30 last:border-0',
                        chapter.isVolume && 'bg-muted/30',
                        !chapter.isVolume && underVolume && 'pl-3',
                      )}
                      style={{ height: `${CATALOG_ROW_HEIGHT_PX}px` }}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        class={cn(
                          'flex h-full min-h-0 w-full justify-start rounded-md px-3 text-left text-sm font-normal',
                          chapter.isVolume && 'font-medium text-muted-foreground',
                          isCurrent
                            ? 'bg-primary/10 font-medium text-primary hover:bg-primary/15'
                            : 'text-foreground/90 hover:bg-muted/80',
                        )}
                        onClick={() => props.onSelectChapter(index)}
                      >
                        <span class="flex w-full min-w-0 items-center gap-2">
                          <span class="min-w-0 flex-1 truncate">
                            {chapter.title || `第 ${index + 1} 章`}
                          </span>
                          <ChapterCacheCloudIcon
                            enabled={cacheHintEnabled()}
                            cached={isChapterCached(index)}
                            isVolume={chapter.isVolume}
                          />
                        </span>
                      </Button>
                    </div>
                  );
                }}
              </VirtualChapterList>
            </Show>
          </Show>
        </div>
      </AppDialogContent>
    </AppDialog>
  );
}
