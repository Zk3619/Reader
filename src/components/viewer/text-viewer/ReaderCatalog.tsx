import { createEffect, createMemo, Show } from 'solid-js';
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
} from '@/lib/catalog/chapter-list-layout';
import { useChapterDisplayTitles } from '@/lib/replace-rules/use-chapter-display-titles';
import { isLocalBook } from '@/lib/local-book';
import { cn } from '@/lib/utils';

export interface ReaderCatalogProps {
  onSelectChapter: (index: number) => void;
  onClose?: () => void;
  /** 目录是否打开，用于打开时滚动到当前章节 */
  open?: boolean;
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
  const { resolveTitle } = useChapterDisplayTitles(
    catalog,
    () => textViewerStore.state.book,
    () => textViewerStore.state.book?.origin,
    () => textViewerStore.isUseReplaceRule(),
    () => ({
      chineseConverterType: textViewerStore.state.config.chineseConverterType ?? 0,
    }),
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

  const catalogLoading = () => {
    const s = textViewerStore.state;
    return (
      s.catalog.length === 0 &&
      (s.contentBootstrapping || (s.contentLoading && !s.showContent))
    );
  };

  return (
    <Show
      when={!catalogLoading()}
      fallback={
        <p class="px-4 py-8 text-center text-sm text-muted-foreground">正在加载目录…</p>
      }
    >
    <VirtualChapterList
      class={cn('reader-catalog-scroll', props.drawerBottom && 'px-2')}
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
                    {resolveTitle(index, chapter)}
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
                  {resolveTitle(index, chapter)}
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
    </Show>
  );
}
