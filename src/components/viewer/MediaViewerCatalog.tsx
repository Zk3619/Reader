import { createEffect, createMemo, Show } from 'solid-js';
import { viewerStore } from '@/stores/viewer';
import {
  scrollCatalogIndexIntoView,
  VirtualChapterList,
} from '@/components/books/VirtualChapterList';
import { Button } from '@/components/ui/button';
import {
  buildChapterRowMetas,
  CATALOG_ROW_HEIGHT_PX,
} from '@/lib/catalog/chapter-list-layout';
import { useChapterDisplayTitles } from '@/lib/replace-rules/use-chapter-display-titles';
import { cn } from '@/lib/utils';

export interface MediaViewerCatalogProps {
  onSelectChapter: (index: number) => void;
  open?: boolean;
  /** 目录拉取中（无章节数据时显示占位） */
  loading?: boolean;
  /** 底部抽屉模式（移动端），避免选中行圆角被裁切 */
  drawerBottom?: boolean;
}

export function MediaViewerCatalog(props: MediaViewerCatalogProps) {
  const catalog = () => viewerStore.state.catalog;
  const chapterIndex = () => viewerStore.state.chapterIndex;
  const rows = createMemo(() => buildChapterRowMetas(catalog()));
  const { resolveTitle } = useChapterDisplayTitles(
    catalog,
    () => viewerStore.state.book,
    () => viewerStore.state.book?.origin,
    () => viewerStore.state.book?.readConfig?.useReplaceRule !== false,
  );

  let scrollContainer: HTMLDivElement | undefined;
  let catalogWasOpen = false;
  let lastCatalogLength = 0;

  const scrollToCurrentChapter = (behavior: ScrollBehavior = 'smooth') => {
    const el = scrollContainer;
    if (!el || !(props.open ?? false) || catalog().length === 0) return;
    scrollCatalogIndexIntoView(el, chapterIndex(), CATALOG_ROW_HEIGHT_PX, behavior);
  };

  createEffect(() => {
    const open = props.open ?? false;
    const len = catalog().length;
    const lenChangedWhileOpen = open && len !== lastCatalogLength;
    lastCatalogLength = len;

    if (!open) {
      catalogWasOpen = false;
      return;
    }
    if (len === 0) return;

    const justOpened = !catalogWasOpen;
    catalogWasOpen = true;
    if (!justOpened && !lenChangedWhileOpen) return;

    requestAnimationFrame(() => scrollToCurrentChapter('smooth'));
  });

  const catalogLoading = () => props.loading === true && catalog().length === 0;

  return (
    <Show
      when={!catalogLoading()}
      fallback={
        <p class="px-4 py-8 text-center text-sm text-muted-foreground">正在加载目录…</p>
      }
    >
    <Show
      when={rows().length > 0}
      fallback={
        <p class="px-4 py-8 text-center text-sm text-muted-foreground">目录为空</p>
      }
    >
    <VirtualChapterList
      class={cn('reader-catalog-scroll mb-2', props.drawerBottom && 'px-2')}
      count={rows().length}
      onScrollContainer={(el) => {
        scrollContainer = el;
      }}
    >
      {(index) => {
        const row = rows()[index];
        if (!row) return null;
        const { chapter, underVolume } = row;
        const isVol = chapter.isVolume;
        const isCurrent = index === chapterIndex();

        return (
          <div
            class={cn('box-border w-full min-w-0 px-0', underVolume && !isVol && 'pl-4')}
            style={{ height: `${CATALOG_ROW_HEIGHT_PX}px` }}
          >
            <Button
              type="button"
              variant="ghost"
              class={cn(
                'flex h-full min-h-0 w-full justify-start rounded-md px-4 text-left text-sm font-normal transition-colors',
                isVol && 'text-muted-foreground hover:bg-muted/80',
                !isVol && 'hover:bg-muted/80',
                isCurrent && 'bg-primary/10 font-medium text-primary',
              )}
              onClick={() => props.onSelectChapter(index)}
            >
              <span class="min-w-0 flex-1 truncate">
                {resolveTitle(index, chapter)}
              </span>
            </Button>
          </div>
        );
      }}
    </VirtualChapterList>
    </Show>
    </Show>
  );
}
