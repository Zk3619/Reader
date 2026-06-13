/**

 * 漫画阅读器单页图片：共享加载链路 + 滚动/翻页展示样式

 */



import { Show } from 'solid-js';

import type { BookSource } from '@/types';

import { createReaderImageLoad } from '@/lib/media/image/use-reader-image-load';

import { LoaderIcon } from '@/components/shared/icons';

import { cn } from '@/lib/utils';



export type MangaPageFit = 'scroll' | 'paged';



export interface MangaPageImgProps {

  src: string;

  referer?: string | null;

  source?: BookSource | null;

  legadoImageHeaders?: Record<string, string>;

  /** scroll：宽度铺满；paged：高度随父级壳层，宽度按比例 */

  fit: MangaPageFit;

  class?: string;

  deferUntilVisible?: boolean;

  /** 与章内预取联动的 IO 边距（px） */

  lazyLoadRootMarginPx?: number;

  useFetchQueue?: boolean;

  batchRetryToken?: number;

  bookUrl?: string | null;

  chapterIndex?: number;

  pageIndex?: number;

  persistToDiskWhileReading?: boolean;

}



export function MangaPageImg(props: MangaPageImgProps) {

  const load = createReaderImageLoad({

    getSrc: () => props.src,

    getReferer: () => props.referer,

    getSource: () => props.source ?? null,

    getLegadoImageHeaders: () => props.legadoImageHeaders,

    getDeferUntilVisible: () => props.deferUntilVisible,

    getLazyLoadRootMarginPx: () => props.lazyLoadRootMarginPx,

    getUseFetchQueue: () => props.useFetchQueue,

    getBatchRetryToken: () => props.batchRetryToken,

    getBookUrl: () => props.bookUrl,

    getChapterIndex: () => props.chapterIndex,

    getPageIndex: () => props.pageIndex,

    getPersistToDisk: () => props.persistToDiskWhileReading,

  });



  const imgClass = () =>

    props.fit === 'paged'

      ? 'block h-full w-auto max-w-none shrink-0 bg-neutral-900'

      : 'block w-full bg-neutral-900';



  const wrapperClass = () =>

    cn(

      props.fit === 'paged'

        ? 'relative flex h-full items-center justify-center'

        : 'relative w-full',

      props.class,

    );



  const placeholderClass = () =>

    cn(

      'flex flex-col items-center justify-center gap-2 rounded-md bg-muted/30 px-4 text-center text-xs text-muted-foreground',

      props.fit === 'paged' ? 'h-full w-auto min-h-0' : 'min-h-[160px] w-full',

    );



  return (

    <div ref={load.bindContainer} class={wrapperClass()}>

      <Show when={load.phase() === 'loading'}>

        <div class={placeholderClass()} aria-busy="true" aria-live="polite">

          <Show when={load.statusHint() !== '滚动到此处后加载'}>

            <LoaderIcon class="h-6 w-6 shrink-0 animate-spin text-muted-foreground" />

          </Show>

          <span class="max-w-full">{load.statusHint() || '正在加载图片…'}</span>

        </div>

      </Show>



      <Show when={load.phase() === 'error'}>

        <button

          type="button"

          class={cn(

            placeholderClass(),

            'cursor-pointer border border-dashed border-muted-foreground/40',

            'transition-colors hover:bg-muted/50 hover:text-foreground',

            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',

            load.isLoadFailureSuspended() && 'opacity-90',

          )}

          onClick={(e) => {

            e.stopPropagation();

            load.retry();

          }}

          aria-label="图片加载失败，点击重试"

        >

          <span class="text-sm text-muted-foreground">图片加载失败</span>

          <Show
            when={!load.isLoadFailureSuspended()}
            fallback={
              <span class="text-[11px] opacity-80">
                {load.statusHint() || '请稍后重试'}
              </span>
            }
          >
            <span class="text-[11px] opacity-80">{load.statusHint() || '点击重试'}</span>
          </Show>

        </button>

      </Show>



      <Show when={load.phase() === 'ready' && load.displaySrc()}>

        <img

          src={load.displaySrc()!}

          alt=""

          class={imgClass()}

          decoding="async"

          referrerPolicy="no-referrer"

          onError={load.onImgError}

        />

      </Show>

    </div>

  );

}


