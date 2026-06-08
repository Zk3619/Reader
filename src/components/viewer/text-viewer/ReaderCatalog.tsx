/**
 * 阅读器目录列表
 * 参考 legado：卷/章层级、当前章节高亮、点击跳转、自动滚动到当前章节
 * - 卷（isVolume）作为分组标题展示，其下章节缩进
 * - 大目录使用虚拟列表，打开抽屉不阻塞主线程
 */

import { createEffect, createMemo } from 'solid-js';
import { textViewerStore } from '@/stores/viewer';
import { ChapterCacheCloudIcon } from '@/components/books/ChapterCacheCloudIcon';
import {
  scrollCatalogIndexIntoView,
  VirtualChapterList,
} from '@/components/books/VirtualChapterList';
import { useCachedChapterIndices } from '@/lib/chapter-cache/use-cached-chapter-indices';
import {
  buildChapterRowMetas,
  CATALOG_ROW_HEIGHT_PX,
  formatTocChapterDisplayTitle,
} from '@/lib/catalog/chapter-list-layout';
import { isLocalBook } from '@/lib/local-book';
import { cn } from '@/lib/utils';

export interface ReaderCatalogProps {
  onSelectChapter: (index: number) => void;
  onClose?: () => void;
  /** 目录是否打开，用于触发滚动到当前章节（仅当当前章变化时滚动，避免每次打开都重滚） */
  open?: boolean;
  /** 缓存的滚动位置，打开时恢复 */
  initialScrollTop?: number;
  /** 滚动时上报，用于关闭后缓存 */
  onScrollTop?: (scrollTop: number) => void;
  /** 底部抽屉模式（移动端），避免选中行圆角被裁切 */
  drawerBottom?: boolean;
}

export function ReaderCatalog(props: ReaderCatalogProps) {
  const catalog = () => textViewerStore.state.catalog;
  const chapterIndex = () => textViewerStore.state.chapterIndex;
  const bookUrl = () => textViewerStore.state.book?.bookUrl;
  const showCacheHint = () => {
    const book = textViewerStore.state.book;
    return Boolean(book && !isLocalBook(book));
  };
  const { cached: cachedIndices } = useCachedChapterIndices(
    bookUrl,
    () => showCacheHint() && Boolean(props.open),
    true,
  );
  const isChapterCached = (idx: number) => cachedIndices().has(idx);

  const rows = createMemo(() => buildChapterRowMetas(catalog()));

  let scrollContainer: HTMLDivElement | undefined;
  let lastScrolledToIndex = -1;
  let lastCatalogLength = 0;

  createEffect(() => {
    const list = catalog();
    if (list.length !== lastCatalogLength) {
      lastCatalogLength = list.length;
      lastScrolledToIndex = -1;
    }
    if (!props.open || list.length === 0) return;
    const idx = chapterIndex();
    if (idx === lastScrolledToIndex) return;
    if (!scrollContainer) return;
    lastScrolledToIndex = idx;
    requestAnimationFrame(() => {
      if (!scrollContainer) return;
      scrollCatalogIndexIntoView(
        scrollContainer,
        idx,
        CATALOG_ROW_HEIGHT_PX,
        'smooth',
      );
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
      class={cn('reader-catalog-scroll', props.drawerBottom && 'px-2')}
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

        if (isVol) {
          return (
            <div
              class="box-border w-full min-w-0 px-0"
              style={{ height: `${CATALOG_ROW_HEIGHT_PX}px` }}
            >
              <button
                type="button"
                class={cn(
                  'flex h-full w-full items-center truncate rounded-md px-4 text-left text-sm',
                  'text-muted-foreground hover:bg-muted/80',
                  isCurrent && 'bg-primary/10 font-medium text-primary',
                )}
                onClick={() => props.onSelectChapter(index)}
              >
                <span class="flex w-full min-w-0 items-center gap-2">
                  <span class="min-w-0 flex-1 truncate">
                    {formatTocChapterDisplayTitle(chapter.title, index)}
                  </span>
                  <ChapterCacheCloudIcon
                    enabled={showCacheHint()}
                    cached={isChapterCached(index)}
                    isVolume
                  />
                </span>
              </button>
            </div>
          );
        }

        return (
          <div
            class={cn('box-border w-full min-w-0 px-0', underVolume && 'pl-4')}
            style={{ height: `${CATALOG_ROW_HEIGHT_PX}px` }}
          >
            <button
              type="button"
              class={cn(
                'flex h-full w-full items-center truncate rounded-md px-4 text-left text-sm transition-colors',
                isCurrent
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-foreground hover:bg-muted',
              )}
              onClick={() => props.onSelectChapter(index)}
            >
              <span class="flex w-full min-w-0 items-center gap-2">
                <span class="min-w-0 flex-1 truncate">
                  {formatTocChapterDisplayTitle(chapter.title, index)}
                </span>
                <ChapterCacheCloudIcon
                  enabled={showCacheHint()}
                  cached={isChapterCached(index)}
                />
              </span>
            </button>
          </div>
        );
      }}
    </VirtualChapterList>
  );
}
