/**
 * 书籍信息页 — 查看目录（对齐 legado BookInfoActivity.openChapterList）
 */

import { Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import {
  AppDialog,
  AppDialogHeader,
  AppDialogScrollBody,
  AppDialogTitle,
} from '@/components/shared/AppDialog';
import { BookInfoDrawerDialogContent } from '@/pages/book-info/book-info-drawer-overlay';
import {
  syncAppDrawerOverlayLock,
  useAppDrawerOverlayLock,
} from '@/components/shared/app-drawer-overlay-lock';
import { Button } from '@/components/ui/button';
import {
  dialogScrollFrameFlex,
  dialogVirtualListPanelMinHeight,
  dialogVirtualListPanelStableHeight,
  dialogVirtualListPanelWidth,
  dialogVirtualListScroll,
} from '@/lib/ui/viewport-classes';
import { ChapterCacheCloudIcon } from '@/components/books/ChapterCacheCloudIcon';
import {
  scrollCatalogIndexIntoView,
  VirtualChapterList,
} from '@/components/books/VirtualChapterList';
import { useCachedChapterIndices } from '@/lib/chapter-cache/use-cached-chapter-indices';
import {
  buildChapterRowMetas,
  CATALOG_ROW_HEIGHT_PX,
} from '@/lib/catalog/chapter-list-layout';
import { useChapterDisplayTitles } from '@/lib/replace-rules/use-chapter-display-titles';
import { cn } from '@/lib/utils';
import type { Book, BookChapter, SearchBook } from '@/types';

export interface BookInfoChapterListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookName: string;
  /** 用于替换净化标题展示 */
  book?: Book | SearchBook;
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
  /** 在 BookInfoDrawer 内打开时须为 true，以保证 Dialog 叠在抽屉之上 */
  inDrawer?: boolean;
}

export function BookInfoChapterListDialog(props: BookInfoChapterListDialogProps) {
  const drawerOverlayLock = useAppDrawerOverlayLock();
  const overlayReleaseRef: { current: (() => void) | undefined } = { current: undefined };

  createEffect(() => {
    syncAppDrawerOverlayLock(
      drawerOverlayLock,
      props.open && Boolean(props.inDrawer),
      overlayReleaseRef,
    );
  });

  onCleanup(() => {
    overlayReleaseRef.current?.();
    overlayReleaseRef.current = undefined;
  });

  const cacheHintEnabled = () =>
    Boolean(props.showChapterCacheHint && props.bookUrl);
  const { cached: cachedIndices } = useCachedChapterIndices(
    () => props.bookUrl,
    () => props.open && cacheHintEnabled(),
    true,
  );
  const isChapterCached = (idx: number) => cachedIndices().has(idx);

  const [contentReady, setContentReady] = createSignal(false);
  let firstPaintFrame: number | undefined;
  let listMountFrame: number | undefined;
  const cancelDeferredListMount = () => {
    if (firstPaintFrame !== undefined) cancelAnimationFrame(firstPaintFrame);
    if (listMountFrame !== undefined) cancelAnimationFrame(listMountFrame);
    firstPaintFrame = undefined;
    listMountFrame = undefined;
  };
  const scheduleListMountAfterDialogPaint = () => {
    cancelDeferredListMount();
    setContentReady(false);
    firstPaintFrame = requestAnimationFrame(() => {
      firstPaintFrame = undefined;
      listMountFrame = requestAnimationFrame(() => {
        listMountFrame = undefined;
        setContentReady(true);
      });
    });
  };

  createEffect(() => {
    if (props.open) return;
    cancelDeferredListMount();
    setContentReady(false);
  });
  onCleanup(cancelDeferredListMount);

  const rows = createMemo(() => buildChapterRowMetas(props.chapters));
  const showLoadingPlaceholder = () =>
    !contentReady() || Boolean(props.loading && props.chapters.length === 0);
  const { resolveTitle } = useChapterDisplayTitles(
    // 自动预取完成时弹窗通常仍关闭；此时不应在 UI 线程提前处理整份章节标题。
    () => (props.open && contentReady() ? props.chapters : []),
    () => props.book,
    () => props.book?.origin,
    () => (props.book as Book | undefined)?.readConfig?.useReplaceRule !== false,
  );

  const [scrollTrack, setScrollTrack] = createSignal<HTMLDivElement>();

  createEffect(() => {
    if (!props.open) return;
    const idx = props.currentChapterIndex ?? -1;
    requestAnimationFrame(() => {
      const el = scrollTrack();
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
      <BookInfoDrawerDialogContent
        class={cn(dialogVirtualListPanelWidth, dialogVirtualListPanelStableHeight)}
        onOpenAutoFocus={scheduleListMountAfterDialogPaint}
      >
        <AppDialogHeader>
          <AppDialogTitle class="text-base">目录 · {props.bookName}</AppDialogTitle>
        </AppDialogHeader>
        <AppDialogScrollBody
          compact
          frameClass={cn(dialogScrollFrameFlex, dialogVirtualListPanelMinHeight)}
          class={cn(dialogVirtualListScroll, 'overflow-hidden!')}
        >
          <Show
            when={!showLoadingPlaceholder()}
            fallback={
              <div
                class="mb-2 flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-1 py-2"
                aria-label="正在加载目录"
              >
                {Array.from({ length: 6 }, (_, index) => (
                  <div
                    class={cn(
                      'h-10 shrink-0 animate-pulse rounded-md bg-muted',
                      index % 3 === 0 ? 'w-4/5' : index % 3 === 1 ? 'w-full' : 'w-11/12',
                    )}
                  />
                ))}
              </div>
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
                class="my-2 min-h-0 w-full flex-1 overflow-y-auto"
                count={rows().length}
                onScrollContainer={setScrollTrack}
              >
                {(index) => {
                  const row = rows()[index];
                  if (!row) return null;
                  const { chapter, underVolume } = row;
                  const isCurrent = index === (props.currentChapterIndex ?? -1);

                  return (
                    <div
                      class={cn(
                        'box-border w-full min-w-0 border-b border-border/30 pb-1 last:border-0',
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
                            {resolveTitle(index, chapter)}
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
        </AppDialogScrollBody>
      </BookInfoDrawerDialogContent>
    </AppDialog>
  );
}
