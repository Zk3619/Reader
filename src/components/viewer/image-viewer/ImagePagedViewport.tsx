import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  splitProps,
  type Accessor,
} from 'solid-js';
import { viewerStore } from '@/stores/viewer';
import { MangaPageImg } from '@/components/viewer/image-viewer/ImagePageImg';
import type { ReaderPagedNavApi } from '@/components/viewer/text-viewer/reader-paged-nav';
import {
  chapterPosToPageIndex,
  pageIndexToChapterPos,
} from '@/lib/media/image/image-paged-layout';
import { cn } from '@/lib/utils';
import { isMobile } from '@/lib/platform/detect';
import { mediaViewerContentScrollClass } from '@/components/viewer/viewer-chrome';
import type { MangaPageItem } from '@/components/viewer/image-viewer/ImageScrollViewport';
import type { BookSource } from '@/types';

export interface ImagePagedViewportProps {
  class?: string;
  /** 内容缩放：100% 时单页高度与视口一致 */
  contentScale: Accessor<number>;
  imageList: Accessor<MangaPageItem[]>;
  chapterPageReferer: Accessor<string | undefined>;
  bookSource: Accessor<BookSource | null>;
  batchRetryToken: Accessor<number>;
  mangaDiskCacheWhileReading?: Accessor<boolean>;
  onRequestPrevChapter: () => void | Promise<void>;
  onRequestNextChapter: () => void | Promise<void>;
  onViewPageChange?: (page: number) => void;
  onRegisterNav?: (api: ReaderPagedNavApi) => void;
}

export function ImagePagedViewport(props: ImagePagedViewportProps) {
  const [local, imgProps] = splitProps(props, [
    'class',
    'contentScale',
    'onRequestPrevChapter',
    'onRequestNextChapter',
    'onViewPageChange',
    'onRegisterNav',
  ]);

  const [pageIndex, setPageIndex] = createSignal(0);
  const [viewportEl, setViewportEl] = createSignal<HTMLDivElement | undefined>();
  const [viewportHeightPx, setViewportHeightPx] = createSignal(0);

  let skipChapterPosSync = false;
  let progressRestoredKey = '';

  const pageCount = () => imgProps.imageList().length;
  const isAtFirstChapter = () => viewerStore.state.chapterIndex <= 0;
  const isAtLastChapter = () =>
    viewerStore.state.chapterIndex >= viewerStore.state.catalog.length - 1;

  const measureViewportHeight = (el: HTMLDivElement) => {
    const rectH = el.getBoundingClientRect().height;
    if (rectH > 0) return Math.round(rectH);
    if (el.clientHeight > 0) return el.clientHeight;
    const parentH = el.parentElement?.getBoundingClientRect().height ?? 0;
    if (parentH > 0) return Math.round(parentH);
    return Math.round(window.innerHeight * 0.85);
  };

  createEffect(() => {
    const el = viewportEl();
    if (!el) return;

    const sync = () => setViewportHeightPx(measureViewportHeight(el));
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    sync();
    const raf = requestAnimationFrame(sync);
    const onWinResize = () => sync();
    window.addEventListener('resize', onWinResize);

    onCleanup(() => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', onWinResize);
    });
  });

  /** 100% = 视口高度；缩放直接乘在壳层高度上 */
  const pageShellHeightPx = createMemo(() => {
    const base = viewportHeightPx();
    const scale = local.contentScale();
    if (base <= 0 || !Number.isFinite(scale)) return 0;
    return Math.max(1, Math.round(base * scale));
  });

  const pageShellStyle = createMemo((): Record<string, string> | undefined => {
    const h = pageShellHeightPx();
    if (h <= 0) return undefined;
    return { height: `${h}px` };
  });

  const goToPage = (target: number) => {
    const total = pageCount();
    if (total <= 0) return;
    const clamped = Math.max(0, Math.min(total - 1, target));
    skipChapterPosSync = true;
    setPageIndex(clamped);
    local.onViewPageChange?.(clamped + 1);
    queueMicrotask(() => {
      skipChapterPosSync = false;
    });
  };

  const goNextPage = () => {
    const idx = pageIndex();
    if (idx < pageCount() - 1) {
      goToPage(idx + 1);
      return;
    }
    if (!isAtLastChapter()) {
      void local.onRequestNextChapter();
    }
  };

  const goPrevPage = () => {
    const idx = pageIndex();
    if (idx > 0) {
      goToPage(idx - 1);
      return;
    }
    if (!isAtFirstChapter()) {
      void local.onRequestPrevChapter();
    }
  };

  const setPageProgress = (ratio: number) => {
    const total = pageCount();
    const target =
      total <= 1 ? 0 : Math.round(Math.max(0, Math.min(1, ratio)) * (total - 1));
    if (target === pageIndex()) return;
    goToPage(target);
  };

  const getBookmarkSnapshot = () => {
    const total = pageCount();
    const idx = pageIndex();
    return {
      chapterPos: pageIndexToChapterPos(idx, total),
      pageText: '',
      pageIndex: idx,
      pageCount: total,
    };
  };

  createEffect(() => {
    local.onRegisterNav?.({
      goNextPage,
      goPrevPage,
      setPageProgress,
      getBookmarkSnapshot,
    });
  });

  createEffect(() => {
    if (skipChapterPosSync) return;
    const total = pageCount();
    viewerStore.setChapterPos(pageIndexToChapterPos(pageIndex(), total));
  });

  createEffect(() => {
    const ch = viewerStore.state.chapterIndex;
    const total = pageCount();
    const key = `${ch}:${total}`;
    if (total <= 0) return;
    if (progressRestoredKey === key) return;
    progressRestoredKey = key;
    goToPage(chapterPosToPageIndex(viewerStore.state.chapterPos, total));
  });

  createEffect(() => {
    viewerStore.state.chapterIndex;
    progressRestoredKey = '';
  });

  const currentItem = () => imgProps.imageList()[pageIndex()];

  return (
    <div
      ref={setViewportEl}
      class={cn(
        'reader-paged-viewport relative flex h-full min-h-0 w-full items-center justify-center overflow-auto bg-black/90',
        isMobile() && mediaViewerContentScrollClass,
        local.class,
      )}
    >
      <div
        class="flex shrink-0 items-center justify-center"
        style={pageShellStyle()}
      >
        {currentItem() ? (
          <MangaPageImg
            src={currentItem()!.url}
            legadoImageHeaders={currentItem()!.legadoHeaders}
            referer={imgProps.chapterPageReferer()}
            source={imgProps.bookSource()}
            bookUrl={viewerStore.state.book?.bookUrl}
            chapterIndex={viewerStore.state.chapterIndex}
            pageIndex={pageIndex()}
            fit="paged"
            class="h-full"
            useFetchQueue
            batchRetryToken={imgProps.batchRetryToken()}
            persistToDiskWhileReading={imgProps.mangaDiskCacheWhileReading?.() ?? true}
          />
        ) : null}
      </div>
    </div>
  );
}
