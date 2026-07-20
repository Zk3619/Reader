import {

  createEffect,

  Index,

  onCleanup,

  onMount,

  type Accessor,

} from 'solid-js';

import { viewerStore } from '@/stores/viewer';

import { MangaPageImg } from '@/components/media/viewer/image/ImagePageImg';

import { MANGA_SCROLL_ROOT_ATTR } from '@/lib/media/image/image-scroll-root';

import type { ReaderInlineImageRef } from '@/lib/media/text/reader-content-blocks';

import { chapterPosToPageIndex } from '@/lib/media/image/image-paged-layout';

import { mangaLazyLoadRootMarginPx } from '@/lib/media/image/image-viewer-ui-config';

import { useMediaContentScrollClass } from '@/lib/viewer/viewer-chrome-layout';

import { cn } from '@/lib/utils';



export type ImageScrollNavApi = {

  scrollToPage: (pageIndex: number) => void;

  scrollToProgress: (ratio: number) => void;

};



export type MangaPageItem = ReaderInlineImageRef & { slot: string; page: number };



export interface ImageScrollViewportProps {

  class?: string;

  imageList: Accessor<MangaPageItem[]>;

  contentMaxWidthStyle: Accessor<Record<string, string>>;

  chapterPageReferer: Accessor<string | undefined>;

  bookSource: Accessor<import('@/types').BookSource | null>;

  batchRetryToken: Accessor<number>;

  mangaPreDownloadNum: Accessor<number>;

  mangaEstimatedPageHeightPx?: Accessor<number>;

  mangaDiskCacheWhileReading?: Accessor<boolean>;

  onViewPageChange?: (page: number) => void;

  onRegisterNav?: (api: ImageScrollNavApi) => void;

}



export function ImageScrollViewport(props: ImageScrollViewportProps) {

  const scrollRootClass = useMediaContentScrollClass('bg-background/90');

  let scrollRootEl: HTMLDivElement | undefined;

  let progressRestoredKey = '';



  const totalPages = () => props.imageList().length;

  const lazyRootMarginPx = () =>
    mangaLazyLoadRootMarginPx(
      props.mangaPreDownloadNum(),
      props.mangaEstimatedPageHeightPx?.() ?? undefined,
    );



  const updateViewPageFromScroll = () => {

    const root = scrollRootEl;

    if (!root) return;

    const slots = root.querySelectorAll('[data-manga-page]');

    if (slots.length === 0) {

      props.onViewPageChange?.(1);

      return;

    }

    const center = root.scrollTop + root.clientHeight / 2;

    let bestPage = 1;

    let bestDist = Number.POSITIVE_INFINITY;

    slots.forEach((el) => {

      const node = el as HTMLElement;

      const page = Number(node.dataset.mangaPage);

      if (!Number.isFinite(page) || page <= 0) return;

      const mid = node.offsetTop + node.offsetHeight / 2;

      const dist = Math.abs(mid - center);

      if (dist < bestDist) {

        bestDist = dist;

        bestPage = page;

      }

    });

    props.onViewPageChange?.(bestPage);

    const total = totalPages();

    if (total > 0) {

      const ratio = total <= 1 ? 0 : (bestPage - 1) / (total - 1);

      viewerStore.setChapterPos(ratio);

    }

  };



  const scrollToPage = (pageIndex: number) => {

    const root = scrollRootEl;

    if (!root) return;

    const el = root.querySelector<HTMLElement>(

      `[data-manga-page="${pageIndex + 1}"]`,

    );

    if (!el) return;

    const top = el.offsetTop - (root.clientHeight - el.offsetHeight) / 2;

    root.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });

  };



  const scrollToProgress = (ratio: number) => {

    const total = totalPages();

    if (total <= 0) return;

    const pageIndex = chapterPosToPageIndex(ratio, total);

    scrollToPage(pageIndex);

  };



  onMount(() => {

    const root = scrollRootEl;

    if (!root) return;

    const onScroll = () => updateViewPageFromScroll();

    root.addEventListener('scroll', onScroll, { passive: true });

    onCleanup(() => root.removeEventListener('scroll', onScroll));

  });



  createEffect(() => {

    props.onRegisterNav?.({ scrollToPage, scrollToProgress });

  });



  createEffect(() => {

    const ch = viewerStore.state.chapterIndex;

    const total = totalPages();

    const key = `${ch}:${total}`;

    if (total <= 0 || progressRestoredKey === key) return;

    progressRestoredKey = key;

    const pageIndex = chapterPosToPageIndex(viewerStore.state.chapterPos, total);

    queueMicrotask(() => {

      const root = scrollRootEl;

      const el = root?.querySelector<HTMLElement>(

        `[data-manga-page="${pageIndex + 1}"]`,

      );

      if (!root || !el) return;

      const top = el.offsetTop - (root.clientHeight - el.offsetHeight) / 2;

      root.scrollTop = Math.max(0, top);

      updateViewPageFromScroll();

    });

  });



  createEffect(() => {

    props.imageList().length;

    queueMicrotask(() => updateViewPageFromScroll());

  });



  return (

    <div

      ref={scrollRootEl}

      class={cn(scrollRootClass(), props.class)}

      {...{ [MANGA_SCROLL_ROOT_ATTR]: '' }}

    >

      <div

        class="mx-auto flex w-full flex-col"

        style={props.contentMaxWidthStyle()}

      >

        <Index each={props.imageList()}>

          {(item) => (

            <div data-manga-page={item().page} class="w-full">

              <MangaPageImg

                src={item().url}

                legadoImageHeaders={item().legadoHeaders}

                referer={props.chapterPageReferer()}

                source={props.bookSource()}

                bookUrl={viewerStore.state.book?.bookUrl}

                chapterIndex={viewerStore.state.chapterIndex}

                pageIndex={item().page - 1}

                fit="scroll"

                deferUntilVisible

                lazyLoadRootMarginPx={lazyRootMarginPx()}

                useFetchQueue

                batchRetryToken={props.batchRetryToken()}

                persistToDiskWhileReading={props.mangaDiskCacheWhileReading?.() ?? true}

              />

            </div>

          )}

        </Index>

      </div>

    </div>

  );

}


