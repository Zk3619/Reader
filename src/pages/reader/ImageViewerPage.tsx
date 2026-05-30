/**
 * 图片阅读（漫画）
 * 对齐 Legado ReadMangaActivity
 */

import { createSignal, Index, Show, createEffect, createMemo, onCleanup, onMount } from 'solid-js';
import { mediaReaderStore } from '@/stores/media-reader';
import {
  MANGA_SCROLL_ROOT_ATTR,
  ReaderInlineImg,
} from '@/components/reader/ReaderInlineImg';
import { flowImageRefs } from '@/lib/media/flow-images';
import { logContentImageDiagnostics } from '@/lib/book-source/content-image-debug';
import type { ReaderInlineImageRef } from '@/lib/reader/reader-content-blocks';

import { getSource } from '@/lib/database/sources';
import type { BookSource } from '@/types';
import { MediaReaderShell } from '@/components/reader/MediaReaderShell';
import { MediaReaderCatalog } from '@/components/reader/MediaReaderCatalog';
import {
  AppDrawer,
  AppDrawerBody,
  AppDrawerClose,
  AppDrawerContent,
  AppDrawerHeader,
} from '@/components/shared/AppDrawer';
import { Button } from '@/components/ui/button';
import { hDrawerPanel } from '@/lib/ui/viewport-classes';

export interface ImageViewerPageProps {
  onClose: () => void;
}

export function ImageViewerPage(props: ImageViewerPageProps) {
  const [catalogOpen, setCatalogOpen] = createSignal(false);
  const [catalogScrollTop, setCatalogScrollTop] = createSignal(0);
  const [bookSource, setBookSource] = createSignal<BookSource | null>(null);
  /** 递增后触发各失败插图组件重试，不重新请求章节 API */
  const [batchRetryToken, setBatchRetryToken] = createSignal(0);
  /** 当前视口中心所在的章内页码（1-based，一张图一页） */
  const [viewPage, setViewPage] = createSignal(1);

  let scrollRootEl: HTMLDivElement | undefined;

  const book = () => mediaReaderStore.state.book;
  const catalog = () => mediaReaderStore.state.catalog;
  const chapterIndex = () => mediaReaderStore.state.chapterIndex;
  const rawContent = () => mediaReaderStore.state.rawContent;
  const mediaUrls = () => mediaReaderStore.state.mediaUrls;
  /** 稳定 id + 文档序，避免 For 复用导致 Tauri/Web 下图序错乱 */
  type MangaPageItem = ReaderInlineImageRef & { slot: string; page: number };
  const imageList = createMemo((): MangaPageItem[] => {
    const idx = chapterIndex();
    const ch = catalog()[idx];
    const refs: ReaderInlineImageRef[] =
      flowImageRefs(rawContent(), ch?.url ?? ch?.baseUrl ?? '');
    const list: ReaderInlineImageRef[] =
      refs.length > 0 ? refs : mediaUrls().map((url) => ({ url }));
    return list.map((ref, i) => ({
      url: ref.url,
      legadoHeaders: ref.legadoHeaders,
      slot: `${idx}:${i}:${ref.url}`,
      page: i + 1,
    }));
  });
  const loading = () => mediaReaderStore.state.loading;
  const error = () => mediaReaderStore.state.error;

  const chapterTitle = () => catalog()[chapterIndex()]?.title ?? '';
  const totalPages = () => imageList().length;

  const updateViewPageFromScroll = () => {
    const root = scrollRootEl;
    if (!root) return;
    const slots = root.querySelectorAll('[data-manga-page]');
    if (slots.length === 0) {
      setViewPage(1);
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
    setViewPage(bestPage);
    mediaReaderStore.setChapterPos(bestPage - 1);
  };

  onMount(() => {
    const root = scrollRootEl;
    if (!root) return;
    const onScroll = () => updateViewPageFromScroll();
    root.addEventListener('scroll', onScroll, { passive: true });
    onCleanup(() => root.removeEventListener('scroll', onScroll));
  });

  createEffect(() => {
    chapterIndex();
    setBatchRetryToken(0);
    setViewPage(1);
    queueMicrotask(() => updateViewPageFromScroll());
  });

  createEffect(() => {
    imageList().length;
    queueMicrotask(() => updateViewPageFromScroll());
  });

  createEffect(() => {
    if (import.meta.env.DEV && !loading() && !error() && rawContent()) {
      logContentImageDiagnostics(rawContent(), 'image-viewer.rawContent', 5);
      const list = imageList();
      console.log('[image-viewer] 渲染列表', {
        count: list.length,
        first: list[0]?.url.split('/').pop(),
        fifth: list[4]?.url.split('/').pop(),
        last: list[list.length - 1]?.url.split('/').pop(),
      });
    }
  });

  createEffect(() => {
    const origin = book()?.origin;
    if (!origin || origin === 'local') {
      setBookSource(null);
      return;
    }
    let cancelled = false;
    void getSource(origin).then((s) => {
      if (!cancelled) setBookSource(s ?? null);
    });
    return () => {
      cancelled = true;
    };
  });

  const goChapter = async (delta: number) => {
    const next = chapterIndex() + delta;
    if (next < 0 || next >= catalog().length) return;
    await mediaReaderStore.loadChapter(next);
  };

  return (
    <>
      <MediaReaderShell
        title={book()?.name ?? ''}
        subtitle={chapterTitle()}
        onClose={props.onClose}
        onOpenCatalog={() => setCatalogOpen(true)}
        onRefresh={() => void mediaReaderStore.refreshChapter()}
        onRetryFailedImages={() => setBatchRetryToken((t) => t + 1)}
        loading={loading()}

        footer={
          <div class="flex items-center justify-between gap-2 px-4 py-2">
            <Button
              variant="outline"
              size="sm"
              disabled={chapterIndex() <= 0 || loading()}
              onClick={() => void goChapter(-1)}
            >
              上一章
            </Button>
            <div class="flex min-w-0 flex-col items-center gap-0.5 text-center">
              <span class="text-xs text-muted-foreground">
                {catalog().length > 0 ? `${chapterIndex() + 1} / ${catalog().length} 章` : ''}
              </span>
              <span class="text-xs tabular-nums text-muted-foreground">
                {totalPages() > 0 ? `${viewPage()} / ${totalPages()} 页` : ''}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={chapterIndex() >= catalog().length - 1 || loading()}
              onClick={() => void goChapter(1)}
            >
              下一章
            </Button>
          </div>
        }
      >
        <div
          ref={scrollRootEl}
          class="h-full overflow-y-auto scroll-gutter-stable-both bg-black/90"
          {...{ [MANGA_SCROLL_ROOT_ATTR]: '' }}
        >

          <Show when={loading()}>
            <div class="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
              加载中…
            </div>
          </Show>
          <Show when={!loading() && error()}>
            <div class="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center">
              <p class="text-sm whitespace-pre-wrap text-destructive">{error()}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void mediaReaderStore.refreshChapter()}
              >
                重试
              </Button>
            </div>
          </Show>
          <Show when={!loading() && !error()}>
            <Show
              when={imageList().length > 0}
              fallback={
                <div class="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center">
                  <p class="text-sm text-muted-foreground">本章暂无图片，请尝试刷新章节</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void mediaReaderStore.refreshChapter()}
                  >
                    刷新本章
                  </Button>
                </div>
              }
            >
              <div class="mx-auto flex w-full max-w-3xl flex-col">
                <Index each={imageList()}>
                  {(item) => (
                    <div data-manga-page={item().page} class="w-full">
                      <ReaderInlineImg
                        src={item().url}
                        legadoImageHeaders={item().legadoHeaders}
                        source={bookSource()}
                        imageStyle="FULL"
                        class="block w-full bg-neutral-900"
                        deferUntilVisible
                        useFetchQueue
                        batchRetryToken={batchRetryToken()}
                      />
                    </div>
                  )}
                </Index>
              </div>
            </Show>
          </Show>
        </div>
      </MediaReaderShell>

      <AppDrawer open={catalogOpen()} onOpenChange={setCatalogOpen}>
        <AppDrawerContent class={hDrawerPanel}>
          <AppDrawerHeader>
            <span>目录</span>
            <AppDrawerClose />
          </AppDrawerHeader>
          <AppDrawerBody class="min-h-0 flex-1 overflow-hidden p-0">
            <MediaReaderCatalog
              open={catalogOpen()}
              initialScrollTop={catalogScrollTop()}
              onScrollTop={setCatalogScrollTop}
              onSelectChapter={(index) => {
                setCatalogOpen(false);
                void mediaReaderStore.loadChapter(index);
              }}
            />
          </AppDrawerBody>
        </AppDrawerContent>
      </AppDrawer>
    </>
  );
}

/** @deprecated 使用 ImageViewerPage */
export const PicReaderPage = ImageViewerPage;
