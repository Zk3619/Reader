import { createEffect, createMemo } from 'solid-js';
import { viewerStore } from '@/stores/viewer';
import {
  scrollCatalogIndexIntoView,
  VirtualChapterList,
} from '@/components/books/VirtualChapterList';
import { buildChapterRowMetas, CATALOG_ROW_HEIGHT_PX } from '@/lib/catalog/chapter-list-layout';
import { cn } from '@/lib/utils';

export interface MediaViewerCatalogProps {
  onSelectChapter: (index: number) => void;
  open?: boolean;
  initialScrollTop?: number;
  onScrollTop?: (scrollTop: number) => void;
}

export function MediaViewerCatalog(props: MediaViewerCatalogProps) {
  const catalog = () => viewerStore.state.catalog;
  const chapterIndex = () => viewerStore.state.chapterIndex;
  const rows = createMemo(() => buildChapterRowMetas(catalog()));

  let scrollContainer: HTMLDivElement | undefined;
  let lastScrolledToIndex = -1;

  createEffect(() => {
    if (!props.open || catalog().length === 0) return;
    const idx = chapterIndex();
    if (idx === lastScrolledToIndex) return;
    if (!scrollContainer) return;
    lastScrolledToIndex = idx;
    requestAnimationFrame(() => {
      if (!scrollContainer) return;
      scrollCatalogIndexIntoView(scrollContainer, idx, CATALOG_ROW_HEIGHT_PX, 'smooth');
      props.onScrollTop?.(scrollContainer.scrollTop);
    });
  });

  createEffect(() => {
    if (!props.open || !scrollContainer) return;
    const initial = props.initialScrollTop ?? 0;
    if (initial <= 0) return;
    lastScrolledToIndex = chapterIndex();
    requestAnimationFrame(() => {
      if (scrollContainer) scrollContainer.scrollTop = initial;
    });
  });

  return (
    <VirtualChapterList
      class="reader-catalog-scroll"
      count={rows().length}
      onScrollContainer={(el) => {
        scrollContainer = el;
      }}
      onScroll={(el) => {
        props.onScrollTop?.(el.scrollTop);
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
            <button
              type="button"
              class={cn(
                'flex h-full w-full items-center truncate rounded-md px-4 text-left text-sm transition-colors',
                isVol && 'text-muted-foreground hover:bg-muted/80',
                !isVol && 'hover:bg-muted/80',
                isCurrent && 'bg-primary/10 font-medium text-primary',
              )}
              onClick={() => props.onSelectChapter(index)}
            >
              <span class="min-w-0 flex-1 truncate">{chapter.title}</span>
            </button>
          </div>
        );
      }}
    </VirtualChapterList>
  );
}
