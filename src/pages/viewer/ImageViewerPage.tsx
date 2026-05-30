import { createSignal, Index, Show, createEffect, createMemo, onCleanup, onMount } from 'solid-js';
import { mediaReaderStore } from '@/stores/media-viewer';
import {
  MANGA_SCROLL_ROOT_ATTR,
  ReaderInlineImg,
} from '@/components/viewer/text-viewer/ReaderInlineImg';
import { flowImageRefs } from '@/lib/media/image/flow-images';
import { logContentImageDiagnostics } from '@/lib/book-source/content-image-debug';
import type { ReaderInlineImageRef } from '@/lib/media/text/reader-content-blocks';

import { getSource } from '@/lib/database/sources';
import type { BookSource } from '@/types';
import {
  MediaViewerShell,
  MediaViewerShellMain,
  MediaViewerHeader,
  MediaViewerFooter,
} from '@/components/viewer/MediaViewerShell';
import { MediaViewerCatalog } from '@/components/viewer/MediaViewerCatalog';
import { MediaViewerToolbarHeader } from '@/components/viewer/MediaViewerToolbarHeader';
import { MediaViewerChapterNavFooter } from '@/components/viewer/MediaViewerChapterNavFooter';
import {
  AppDrawer,
  AppDrawerBody,
  AppDrawerClose,
  AppDrawerContent,
  AppDrawerHeader,
} from '@/components/shared/AppDrawer';
import { Button } from '@/components/ui/button';
import { hDrawerPanel } from '@/lib/ui/viewport-classes';
import { showAppToast } from '@/components/shared/AppToasts';

export interface ImageViewerPageProps {
  onClose: () => void;
}

export function ImageViewerPage(props: ImageViewerPageProps) {
  const [catalogOpen, setCatalogOpen] = createSignal(false);
  const [catalogScrollTop, setCatalogScrollTop] = createSignal(0);
  const [bookSource, setBookSource] = createSignal<BookSource | null>(null);
  const [batchRetryToken, setBatchRetryToken] = createSignal(0);
  const [viewPage, setViewPage] = createSignal(1);

  let scrollRootEl: HTMLDivElement | undefined;

  const book = () => mediaReaderStore.state.book;
  const catalog = () => mediaReaderStore.state.catalog;
  const chapterIndex = () => mediaReaderStore.state.chapterIndex;
  const rawContent = () => mediaReaderStore.state.rawContent;
  const mediaUrls = () => mediaReaderStore.state.mediaUrls;
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
    if (!mediaReaderStore.isOpen()) {
      showAppToast({ title: '未打开书籍', description: '请从书架重新打开本书' });
      return;
    }
    await mediaReaderStore.loadChapter(next);
  };

  const refreshChapter = () => {
    if (!mediaReaderStore.isOpen()) {
      showAppToast({ title: '未打开书籍', description: '请从书架重新打开本书' });
      return;
    }
    void mediaReaderStore.refreshChapter().catch((e) => {
      console.error('[image-viewer] 刷新本章失败', e);
    });
  };

  return (
    <>
      <MediaViewerShell>
        <MediaViewerShellMain>
          <div
            ref={scrollRootEl}
            class="absolute inset-0 overflow-y-auto scroll-gutter-stable-both bg-black/90"
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
                <Button size="sm" variant="outline" onClick={refreshChapter}>
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
                    <Button size="sm" variant="outline" onClick={refreshChapter}>
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

          <MediaViewerHeader placement="overlay">
            <MediaViewerToolbarHeader
              title={book()?.name ?? ''}
              subtitle={chapterTitle()}
              onClose={props.onClose}
              onOpenCatalog={() => setCatalogOpen(true)}
              onRefresh={refreshChapter}
              onRetryFailedImages={() => setBatchRetryToken((t) => t + 1)}
              loading={loading()}
            />
          </MediaViewerHeader>

          <MediaViewerFooter placement="overlay">
            <MediaViewerChapterNavFooter
              chapterIndex={chapterIndex()}
              catalogLength={catalog().length}
              loading={loading()}
              onPrev={() => void goChapter(-1)}
              onNext={() => void goChapter(1)}
              center={
                <span class="text-xs tabular-nums text-muted-foreground">
                  {totalPages() > 0 ? `${viewPage()} / ${totalPages()} 页` : ''}
                </span>
              }
            />
          </MediaViewerFooter>
        </MediaViewerShellMain>
      </MediaViewerShell>

      <AppDrawer open={catalogOpen()} onOpenChange={setCatalogOpen}>
        <AppDrawerContent class={hDrawerPanel}>
          <AppDrawerHeader>
            <span>目录</span>
            <AppDrawerClose />
          </AppDrawerHeader>
          <AppDrawerBody class="min-h-0 flex-1 overflow-hidden p-0">
            <MediaViewerCatalog
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
